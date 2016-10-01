import assert from 'assert';
import backboard from '../index';

let db;

describe('events', () => {
    beforeEach(() => {
        return backboard.open('test', 1, (err, upgradeDB) => {
                const playerStore = upgradeDB.createObjectStore('players', {keyPath: 'pid', autoIncrement: true});
                playerStore.createIndex('tid', 'tid');

                upgradeDB.createObjectStore('teams', {keyPath: 'tid', autoIncrement: true});
            })
            .then(dbLocal => {
                db = dbLocal;
            });
    });

    afterEach(() => {
        db.close();
        backboard.end();
        return backboard.delete('test');
    });

    describe('db', () => {
        it('on and off', (done) => {
            db.on('versionchange', value => {
                assert.equal(value, 'bar');
                done();
            });

            const toRemove = () => {
                done(new Error('Removed listener was called'));
            };
            db.on('versionchange', toRemove);
            db.removeListener('versionchange', toRemove);

            db.emit('versionchange', 'bar');
        });
    });

    describe('backboard', () => {
        it('on and off', (done) => {
            let quotaexceededCount = 0;

            backboard.on('quotaexceeded', value => {
                assert.equal(value, 'bar');
                quotaexceededCount += 1;
                if (quotaexceededCount === 2) {
                    done();
                }
            });
            backboard.on('quotaexceeded', value => {
                assert.equal(value, 'bar');
                quotaexceededCount += 1;
                if (quotaexceededCount === 2) {
                    done();
                }
            });
            backboard.on('blocked', () => {
                done(new Error('Unexpected blocked event'));
            });

            const toRemove = () => {
                quotaexceededCount += 1;
                done(new Error('Removed listener was called'));
            };
            backboard.on('quotaexceeded', toRemove);
            backboard.end('quotaexceeded', toRemove);

            backboard.emit('quotaexceeded', 'bar');
        });
    });
});