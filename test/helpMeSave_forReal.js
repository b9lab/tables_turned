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

describe('HelpMeSave For Real', function() {
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

    let accounts, bytecode;

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

    before("should take the real bytecode", function() {
        bytecode = HelpMeSave.unlinked_binary;
        HelpMeSave.unlinked_binary = "0x606060405234610000575b61026b806100186000396000f3606060405236156100615760e060020a600035046322d122a9811461006e5780632b079b2e1461007d578063363c51dc1461008f5780633ccfd60b146100a1578063cb12b48f146100b0578063d0e30db014610061578063edbb1d43146100e3575b61006c5b6100695b5b565b005b346100005761006c610105565b005b346100005761006c60043561014a565b005b346100005761006c6004356101a9565b005b346100005761006c6101df565b005b34610000576100bd610256565b60408051600160a060020a039092168252519081900360200190f35b61006c610069565b005b34610000576100f0610265565b60408051918252519081900360200190f35b5b565b6000805473ffffffffffffffffffffffffffffffffffffffff19166c0100000000000000000000000033810204179055610069683635c9adc5dea000006101a9565b5b565b60005433600160a060020a03908116911614156101a357604080518281529051908190036020019020678ac7230489e80000900666af8990e3c44a99141561019e57600054600160a060020a0316ff6101a3565b610000565b5b5b5b50565b60005433600160a060020a03908116911614156101a357600154600160a060020a03301631106101a35760018190555b5b5b5b50565b6000805433600160a060020a03908116911614156101a35750600054600160a060020a033081163191338216911614158061021b575060015481105b15610224575060005b604051600160a060020a033316906108fc90839081818181818888f1935050505015156101a357610000565b5b5b5b50565b600054600160a060020a031681565b6001548156";
    });

    after("should restore the bytecode", function() {
        HelpMeSave.unlinked_binary = bytecode;
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

        it("---> should no longer be possible to withdraw even if the owner", function() {
            return expectedException(
                () => instance.withdraw({ from: accounts[ 0 ], gas: 3000000 }),
                3000000);
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
