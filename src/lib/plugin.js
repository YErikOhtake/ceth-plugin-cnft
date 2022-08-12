"use strict"

const debug = require("debug")("cnft-plugin-ceth");
const EventEmitter2 = require("eventemitter2").EventEmitter2;
const Web3 = require("web3");
const Tx = require("ethereumjs-tx").Transaction;
const Common =require("ethereumjs-common").default;

const DigitalContentObjectJson = require("../abi/DigitalContentObject.json");
const createWebsocketProvider = (provider) => new Web3.providers.WebsocketProvider(provider, {
  clientConfig: {
    maxReceivedFrameSize: 100000000,
    maxReceivedMessageSize: 100000000,
  }
});
const customCommon = Common.forCustomChain(
  "mainnet",
  {
    name: "privatechain",
    networkId: 1,
    chainId: 11421,
  },
  "petersburg",
);

class PluginCNFt extends EventEmitter2 {
  constructor(opts) {
    super();
    this._primaryProvider = opts.provider;
    this._secondaryProvider = opts.altProvider || opts.provider;
    this.provider = this._primaryProvider;
    this.web3 = null;
    this.contract = null;
    this.contractAddress = opts.contractAddress;
    this.isBeating = false;
  }

  async connect() {
    debug("connect... " + this.provider);

    if (!this.isBeating) {
      this._heartbeat();
    }
    this.isBeating = true;

    this.web3 = new Web3(createWebsocketProvider(this.provider));
    this.web3.eth.handleRevert = true;
    this.contract = new this.web3.eth.Contract(
      DigitalContentObjectJson.abi,
      this.contractAddress,
    );

    debug("registering DesignLog event handler");
    this.contract.events.DesignLog()
    .on("data", (event) => {
      debug("DesignLog event:");
      debug(event.returnValues);
      this.emit("Design", event.returnValues);
    })
    .on("error", console.error);

    debug("registering MintLog event handler");
    this.contract.events.MintLog()
    .on("data", (event) => {
      debug("MintLog event:");
      debug(event.returnValues);
      this.emit("Mint", event.returnValues);
    })
    .on("error", console.error);

    debug("registering TransferLog event handler");
    this.contract.events.TransferLog()
    .on("data", (event) => {
      debug("TransferLog event:");
      debug(event.returnValues);
      this.emit("Transfer", event);
    })
    .on("error", console.error);

    debug("registering UpdateAllowSecondaryMerketLog event handler");
    this.contract.events.UpdateAllowSecondaryMerketLog()
    .on("data", (event) => {
      debug("UpdateAllowSecondaryMerketLog event:");
      debug(event.returnValues);
      this.emit("UpdateAllowSecondaryMerket", event);
    })
    .on("error", console.error);

    debug("registering SetInfoLog event handler");
    this.contract.events.SetInfoLog()
    .on("data", (event) => {
      debug("SetInfoLog event:");
      debug(event.returnValues);
      this.emit("SetInfo", event);
    })
    .on("error", console.error);
  }

  disconnect() {
    if (!this.web3) return;
    this.web3.currentProvider.disconnect();
    this.web3 = null;
  }

  _heartbeat() {
    setInterval(() => {
      /**
       * Handle web socket disconnects
       * It also serves as a heartbeat to node
       */
      if (this.web3) {
        this.web3.eth.net.isListening()
        .catch((e) => {
          debug("disconnected " + this.provider);
          this.web3.currentProvider.disconnect();
          this.web3 = null;
          if (this.provider === this._primaryProvider) {
            this.provider = this._secondaryProvider;
          } else {
            this.provider = this._primaryProvider;
          }
          const provider = createWebsocketProvider(this.provider);
          provider.on("connect", () => {
            this.connect();
          });
        });
      }

      // reconnect
      if (!this.web3) {
        if (this.provider === this._primaryProvider) {
          this.provider = this._secondaryProvider;
        } else {
          this.provider = this._primaryProvider;
        }
        debug("Attempting to reconnect... " + this.provider);
        const provider = createWebsocketProvider(this.provider);
        provider.on("connect", () => {
          this.connect();
        });
      }
    }, 5 * 1000);
  }

  createAddress() {
    const account = this.web3.eth.accounts.create();
    return { address: account.address, privateKey: account.privateKey };
  }

  getDigitalContentSpec(_specId) {
    return this.contract.methods.getDigitalContentSpec(_specId).call()
    .then(result => {
      return result;
    });
  }

  totalSupplyLimitOf(_specId) {
    return this.contract.methods.totalSupplyLimitOf(_specId).call()
    .then(result => {
      return result;
    });
  }

  specOwnerOf(_specId) {
    return this.contract.methods.specOwnerOf(_specId).call()
    .then(result => {
      return result;
    });
  }

  getDigitalContentObject(_objectId) {
    return this.contract.methods.getDigitalContentObject(_objectId).call()
    .then(result => {
      return result;
    });
  }

  objectIndexOf(_objectId) {
    return this.contract.methods.objectIndexOf(_objectId).call()
    .then(result => {
        return result;
    });
  }

  ownedObjectsOf(_address) {
    return this.contract.methods.ownedObjectsOf(_address).call()
    .then(result => {
      return result;
    });
  }

  design(
    _address,
    _privateKey,
    _name,
    _symbol,
    _contentType,
    _mediaId,
    _totalSupplyLimit,
    _info,
    _originalSpecIds,
    _contractDocuments,
    _copyrightFeeRatio,
    _allowSecondaryMerket,
  ) {
    debug(_address, _privateKey, _name, _symbol, _contentType, _mediaId, _totalSupplyLimit, _info, _originalSpecIds);
    const txData = this.contract.methods.design(
      _name,
      _symbol,
      _contentType,
      _mediaId,
      _totalSupplyLimit,
      _info,
      _originalSpecIds,
      _contractDocuments,
      _copyrightFeeRatio,
      _allowSecondaryMerket,
    ).encodeABI();
    return this._sendSignedTransaction(_address, _privateKey, txData);
  }

  mint(_address, _privateKey, _to, _specId, _mediaId, _info) {
    const txData = this.contract.methods.mint(
      _to,
      _specId,
      _mediaId,
      _info
    ).encodeABI();
    return this._sendSignedTransaction(_address, _privateKey, txData);
  }

  objectTransferFrom(_address, _privateKey, _from, _to, _objectId) {
    const txData = this.contract.methods.transferFrom(
      _from,
      _to,
      _objectId
    ).encodeABI();
    return this._sendSignedTransaction(_address, _privateKey, txData);
  }

  objectTransfer(_address, _privateKey, _to, _objectId) {
    const txData = this.contract.methods.transfer(
      _to,
      _objectId
    ).encodeABI();
    return this._sendSignedTransaction(_address, _privateKey, txData);
  }

  async _sendSignedTransaction(_address, _privateKey, _txData) {
    const nonce = await this.web3.eth.getTransactionCount(_address, "pending");
    const rawTx = {
      from: _address,
      to: this.contract.options.address,
      gas: 4700000,
      gasPrice: 0,
      data: _txData,
      nonce: nonce,
    };
    const tx = new Tx(rawTx, { common: customCommon });
    tx.sign(Buffer.from(_privateKey.split("0x")[1], "hex"));
    const serializedTx = tx.serialize();

    return this.web3.eth.sendSignedTransaction("0x" + serializedTx.toString("hex"))
    .on("confirmation", (confirmationNumber, receipt) => {
      if (confirmationNumber === 1) {
        return { receipt };
      }
    })
    .on("error", (error) =>  {
      return { error };
    });
  }
}

module.exports = PluginCNFt
