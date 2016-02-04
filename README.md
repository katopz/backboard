# Backboard [![Build Status](https://travis-ci.org/dumbmatter/backboard.svg?branch=master)](https://travis-ci.org/dumbmatter/backboard)

[![Sauce Test Status](https://saucelabs.com/browser-matrix/dumbmatter.svg)](https://saucelabs.com/u/dumbmatter)

Backboard is a thin promise-based wrapper around the IndexedDB API, designed to let you mix promises and IndexedDB without sacrificing performance or writing ridiculously messy code.

There are other similar projects, but none of them do quite what I want. They all seem to fall in one of these two categories:

1. They support less features than the raw IndexedDB API, which is not good for a DB-heavy app that is already struggling to deal with IndexedDB's limited feature set.

2. They support extra stuff beyond the raw IndexedDB API, like caching or joins or advanced filtering. That's all great, but then you have this black box sitting between your application and your database, and I don't want a black box potentially interfering with performance or portability or anything like that.

So the goal of Backboard is to expose all of the functionality of IndexedDB with no extra features, just wrapped in a (IMHO) sane promise-based API.

When it's done, it will look something like this:

    const Backboard = require('backboard');

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
    }, {
        // This is copy/pasted from version 1, but with a new index. Backboard will do a diff between versions and figure out what needs to be created/deleted/modified. And if you need to update the actual data in the database, you can use the upgradeFunction property.
        version: 2,
        objectStores: {
            players: {
                options: {keyPath: 'pid', autoIncrement: true},
                indexes: {
                    name: {keyPath: 'name', unique: true},
                    tid: {keyPath: 'tid'}
                }
            },
            teams: {
                options: {keyPath: 'pid', autoIncrement: true},
                indexes: {
                    tid: {keyPath: 'tid', unique: true}
                }
            }
        },
        upgradeFunction: (event) => {
            // This still uses raw IndexedDB API. Would be nice to do better.
            // Also you'd need to write some manual code here if you want to delete and recreate an object store with different options (not indexes, I mean keyPath and autoIncrement).
            const tx = event.currentTarget.transaction;
            tx.objectStore('players').openCursor().onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const p = cursor.value;
                    p.name = 'Player Name';
                    cursor.update(p);
                    cursor.continue();
                }
            };
        }
    }];

    Backboard.open('database-name', schemas)
        .then((db) => {
            // Transaction-free API: each command is in its own transaction
            return db.players.add({
                    pid: 4,
                    name: 'Bob Jones',
                    tid: 0
                })
                .then((key) => {
                    console.log(key);
                    return db.players.index('tid').get(0);
                })
                .then((player) => console.log(player));
        })
        .then(() => {
            // Transaction API: transaction can be reused across many queries - can provide a huge performance boost!
            const tx = db.tx('players'); // Same arguments as IDBDatabase.transaction
            return tx.players.add({
                    name: 'Bob Jones',
                    tid: 0
                })
                .then(() => {
                    return tx.players.index('tid').getAll(0);
                })
                .then((players) => {
                    console.log(players);

                    // This part is optional, it just lets you hook into the underlying IDBTransaction's oncomplete event
                    return tx.complete()
                        .then(() => console.log('Transaction completed'));
                });
        })
        .then(() => {
            // No more cursors!
            return db.players.index('tid')
                .iterate(Backboard.lowerBound(0), 'next', (p, shortCircuit, advance) => {
                    // Skip ahead next iteration, same as cursor.advance
                    if (p.pid === 2) {
                        advance(5);
                    }

                    // Use the shortCircuit function to stop iteration after this callback runs
                    if (p.pid > 10) {
                        shortCircuit();
                    }

                    // Return undefined (or nothing) and it'll just go to the next object
                    // Return a value (or a promise that resolves to a value) and it'll replace the object in the database
                    p.foo = 'updated';
                    return p;
                });
        })
        .then(() => {
            // Other IndexedDB functions are present too
            console.log(db.objectStoreNames);
            return db.players.delete(0)
                .then(() => db.teams.count())
                .then((numTeams) => console.log(numTeams))
                .then(() => db.teams.clear());
        });

## Browser compatibility

It's a bit tricky due to [the interaction between promises and IndexedDB transactions](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/). The current (early 2016) situation is:

**Chrome**: works out of the box.

**Firefox**: works if you use a third-party promises library that resolves promises with microtasks. Bluebird and es6-promise seem to work, and you can make Backboard use them by doing

    Backboard.setPromiseConstructor(require('Bluebird');

or

    Backboard.setPromiseConstructor(require('es6-promise').Promise);

**Edge/IE**: works only if you use a third-party promises library with synchronous promise resolution (which [is not a good thing](http://blog.izs.me/post/59142742143/designing-apis-for-asynchrony)). If you want to go down that path, here's how to do it in Bluebird:

    const BPromise = require('bluebird');
    BPromise.setScheduler((fn) => fn());
    Backboard.setPromiseConstructor(BPromise);

Also Edge has a buggy IndexedDB implementation in general, so you might run into errors caused by that.

**Safari**: [who the fuck knows.](http://www.raymondcamden.com/2014/09/25/IndexedDB-on-iOS-8-Broken-Bad/)