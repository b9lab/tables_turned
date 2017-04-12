"use strict";

const Web3 = require('web3');
const TestRPC = require("ethereumjs-testrpc");
const Promise = require("bluebird");
const eventualify = require("../utils/promiseEventual.js");
const expectedException = require("../utils/expectedException.js");
const truffleContract = require("truffle-contract");
const HelpMeSave = truffleContract(require(__dirname + "/../build/contracts/HelpMeSave.json"));
const assert = require("chai").assert;
const assertPlus = require('assert-plus');

describe('HelpMeSave You Think', function() {
    const web3 = new Web3();
    const savingGoal = web3.toWei(web3.toBigNumber(1000));
    web3.setProvider(TestRPC.provider({
        accounts: [
            {
                secretKey: "0x0011223344556677889900112233445566778899001122334455667788990011",
                balance: "0x" + savingGoal.times(3).toString(16)
            },
            {
                secretKey: "0x1122334455667788990011223344556677889900112233445566778899001122",
                balance: "0x" + savingGoal.times(3).toString(16)
            }
        ]
    }));
    HelpMeSave.setProvider(web3.currentProvider);
    Promise.promisifyAll(web3.eth, { suffix: "Promise" });
    eventualify(web3.eth, "getTransactionReceiptPromise");

    let accounts;

    before("should prepare accounts", function() {
        return web3.eth.getAccountsPromise()
            .then(received => {
                accounts = received;
                return web3.eth.getBalancePromise(accounts[ 0 ]);
            })
            .then(balance => {
                // We are going to reach the saving goal twice
                assert.isTrue(savingGoal.times(2).minus(balance).isNegative(), "needs a lot");
            });
    });

    describe("constructor", function() {
        it("should be possible to deploy but does not save owner", function() {
            return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                .then(created => created.me())
                .then(me => assert.strictEqual(me, "0x0000000000000000000000000000000000000000"));
        });
    });

    describe("MyTestWallet7", function() {
        let instance;

        beforeEach("should deploy an instance", function() {
            return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                .then(created => instance = created);
        });

        it("should be possible to set owner", function() {
            return instance.MyTestWallet7({ from: accounts[ 0 ], gas: 3000000 })
                .then(txObject => Promise.all([
                    instance.me(),
                    instance.savings_goal()
                ]))
                .then(values => {
                    assertPlus.strictEqual(values[ 0 ], accounts[ 0 ]);
                    assertPlus.strictEqual(web3.fromWei(values[ 1 ]).toNumber(), 1000);
                });
        });
    });

    describe("deposit", function() {
        let instance;

        beforeEach("should deploy an instance", function() {
            return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                .then(created => instance = created);
        });

        it("should be possible to deposit", function() {
            return instance.deposit({ from: accounts[ 0 ], value: 1000, gas: 3000000 })
                .then(txObject => web3.eth.getBalancePromise(instance.address))
                .then(balance => assertPlus.strictEqual(balance.toNumber(), 1000));
        });
    });

    // This is what the solidity code leads you to believe
    describe("withdraw when at saving goal", function() {
        let instance;

        beforeEach("should deploy an instance with max saving value and owner", function() {
            return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                .then(created => {
                    instance = created;
                    return instance.deposit({ from: accounts[ 0 ], value: savingGoal, gas: 3000000 });
                })
                .then(txObject => instance.MyTestWallet7({ from: accounts[ 0 ], gas: 3000000 }));
        });

        it("should not be possible to withdraw if not the owner", function() {
            let balanceBefore;
            return web3.eth.getBalancePromise(accounts[ 1 ])
                .then(balance => {
                    balanceBefore = balance;
                    return instance.withdraw({ from: accounts[ 1 ], gas: 3000000 });
                })
                .then(txObject => {
                    return Promise.all([
                        web3.eth.getBalancePromise(instance.address),
                        web3.eth.getBalancePromise(accounts[ 1 ]),
                        web3.eth.getTransactionPromise(txObject.tx),
                        txObject.receipt
                    ]);
                })
                .then(values => {
                    const balanceAfter = balanceBefore
                        .minus(values[ 3 ].gasUsed * values[ 2 ].gasPrice)
                        .plus(0); // Yes, because you got nothing actually.
                    assertPlus.strictEqual(values[ 1 ].toString(10), balanceAfter.toString(10));
                    assertPlus.strictEqual(values[ 0 ].toString(10), savingGoal.toString(10));
                });
        });

        it("---> should be possible to withdraw if the owner", function() {
            let balanceBefore;

            return web3.eth.getBalancePromise(accounts[ 0 ])
                .then(balance => {
                    balanceBefore = balance;
                    return instance.withdraw({ from: accounts[ 0 ] });
                })
                .then(txObject => {
                    return Promise.all([
                        web3.eth.getBalancePromise(instance.address),
                        web3.eth.getBalancePromise(accounts[ 0 ]),
                        web3.eth.getTransactionPromise(txObject.tx),
                        txObject.receipt
                    ]);
                })
                .then(values => {
                    const balanceAfter = balanceBefore
                        .minus(values[ 3 ].gasUsed * values[ 2 ].gasPrice)
                        .plus(savingGoal);
                    assertPlus.strictEqual(values[ 1 ].toString(10), balanceAfter.toString(10));
                    assertPlus.strictEqual(values[ 0 ].toNumber(), 0);
                });
        });
    });

    describe("recovery", function() {
        let instance;

        beforeEach("should deploy an instance with value and owner", function() {
            return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                .then(created => {
                    instance = created;
                    return instance.deposit({ from: accounts[ 0 ], value: 1000, gas: 3000000 });
                })
                .then(txObject => instance.MyTestWallet7({ from: accounts[ 0 ], gas: 3000000 }));
        });

        it("should not be possible for other to destruct even if knows password", function() {
            return instance.recovery("0x98652370388425360742325", { from: accounts[ 1 ], gas: 3000000 })
                .then(txObject => web3.eth.getBalancePromise(instance.address))
                .then(balance => assertPlus.strictEqual(balance.toNumber(), 1000));
        });

        it("should not be possible for owner to destruct if does not know password", function() {
            return expectedException(
                () => instance.recovery("0x00", { from: accounts[ 0 ], gas: 3000000 }),
                3000000);
        });

        it("should be possible for owner to destruct and collect whatever is inside", function() {
            let balanceBefore;

            return web3.eth.getBalancePromise(accounts[ 0 ])
                .then(balance => {
                    balanceBefore = balance;
                    return instance.recovery("0x98652370388425360742325", { from: accounts[ 0 ], gas: 3000000 });
                })
                .then(txObject => Promise.all([
                    web3.eth.getBalancePromise(instance.address),
                    web3.eth.getBalancePromise(accounts[ 0 ]),
                    web3.eth.getTransactionPromise(txObject.tx),
                    txObject.receipt
                ]))
                .then(values => {
                    const balanceAfter = balanceBefore
                        .minus(values[ 3 ].gasUsed * values[ 2 ].gasPrice)
                        .plus(1000);
                    assertPlus.strictEqual(values[ 1 ].toString(10), balanceAfter.toString(10));
                    assertPlus.strictEqual(values[ 0 ].toNumber(), 0);
                });
        });
    });
});
