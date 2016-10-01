import DB from './DB';
import { EventEmitter } from 'events';
import Transaction from './Transaction';
import UpgradeDB from './UpgradeDB';

class Backboard extends EventEmitter {
    constructor() {
        super();
        /*
        this.open('redis', 0, (err, db) => {
            if (err) throw err;
            if (!db) throw 'Database error';

            self.emit('ready');
            self.emit('connect');
        });
        */
    }

    open(name, version, upgradeCallback) {
        return new this.Promise((resolve, reject) => {

            // Pub/Sub
            const self = this;
            this.pub_sub_mode = false;
            this._message = (ch, msg) => {
                if (ch in self.subscriptions && self.subscriptions[ch] == true) {
                    self.emit('message', ch, msg);
                }
            };
            this.on('message', this._message);
            this.subscriptions = [];

            const request = indexedDB.open(name, version);
            request.onerror = event => reject(event.target.error);
            request.onblocked = event => this.emit('blocked', event);
            request.onupgradeneeded = event => {
                const rawDB = event.target.result;
                const tx = new Transaction(upgradeDB, [...rawDB.objectStoreNames], event.currentTarget.transaction);
                const upgradeDB = new UpgradeDB(rawDB, tx, event.oldVersion);

                try {
                    upgradeCallback(null, upgradeDB);
                } catch (err) {
                    tx.abort();
                    rawDB.close();
                    reject(err);
                }
            };
            request.onsuccess = event => {
                const rawDB = event.target.result;
                try {
                    const db = new DB(rawDB);
                    resolve(db);
                } catch (err) {
                    rawDB.close();
                    reject(err);
                }
            };
        });
    }

    delete(name) {
        return new this.Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(name);
            request.onerror = event => reject(event.target.error);
            request.onblocked = () => resolve(); // http://stackoverflow.com/a/27871590/786644
            request.onupgradeneeded = () => reject(new Error('Unexpected upgradeneeded event'));
            request.onsuccess = () => resolve();
        });
    }

    setPromiseConstructor(PromiseConstructor) {
        this.Promise = PromiseConstructor;
    }

    end(eventName, listener) {

        var self = this;

        // Remove all subscriptions (pub/sub)
        this.subscriptions = [];

        // Remove listener to avoid 'too many subscribers errors'
        this.removeListener('message', this._message);
        this.removeAllListeners('message');
        this.removeAllListeners('blocked');
        this.removeAllListeners('quotaexceeded');

        if(eventName && listener) {
            this.removeListener(eventName, listener);
        }

        self.emit('end');
    }
}

['lowerBound', 'upperBound', 'only', 'bound'].forEach(keyRangeFunction => {
    Backboard.prototype[keyRangeFunction] = (...args) => IDBKeyRange[keyRangeFunction].apply(IDBKeyRange, args);
});

if (typeof Promise !== 'undefined') {
    Backboard.prototype.Promise = Promise;
}

export default new Backboard();