'use strict';

const assert = require('assert');
const Backboard = require('..');

const schemas = [{
    version: 1,
    objectStores: {
        players: {
            options: {keyPath: 'pid', autoIncrement: true},
            indexes: {
                tid: {keyPath: 'tid'}
            }
        },
        teams: {
            options: {keyPath: 'pid', autoIncrement: true},
            indexes: {
                tid: {keyPath: 'tid', unique: true}
            }
        }
    }
}];

let db, player;

describe('Transaction', () => {
    beforeEach(() => {
        player = {
            pid: 4,
            tid: 1,
            name: 'John Smith'
        };

        return Backboard.open('test', schemas)
            .then((dbLocal) => {
                db = dbLocal;
            });
    });

    afterEach(() => {
        db.close();
        return Backboard.delete('test');
    });

    describe('complete', () => {
        it('should resolve after transaction completes', () => {
            const tx = db.tx('players', 'readwrite');
            tx.players.put(player);
            player.name = 'Updated';
            tx.players.put(player);

            return tx.complete()
                .then(() => db.players.get(4))
                .then((playerFromDb) => assert.equal(playerFromDb.name, 'Updated'));
        });
    });

    it('should have some kind of error when using a completed transaction', () => {
        const tx = db.tx('players', 'readwrite');

        return tx.complete()
            .then(() => tx.players.get(4))
            .then(assert.fail)
            .catch((err) => assert.equal(err.name, 'TransactionInactiveError'));
    });
});