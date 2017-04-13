"use strict";

const Web3 = require('web3');
const Promise = require("bluebird");
const TestRPC = require("ethereumjs-testrpc");
const ethUtil = require("ethereumjs-util");
const eventualify = require("../utils/promiseEventual.js");
const expectedException = require("../utils/expectedException.js");
const truffleContract = require("truffle-contract");
const HelpMeSave = truffleContract(require(__dirname + "/../build/contracts/HelpMeSave.json"));
const assert = require("chai").assert;
const assertPlus = require('assert-plus');

const compiledBytecode = HelpMeSave.unlinked_binary;
const realDeployTx = "0xcd868f3e799e03c22e52f6f6aa47471685919b817bdc2567917549ed81c75427";
// Taken from here https://etherscan.io/tx/0xcd868f3e799e03c22e52f6f6aa47471685919b817bdc2567917549ed81c75427
const realBytecode = "0x606060405234610000575b61026b806100186000396000f3606060405236156100615760e060020a600035046322d122a9811461006e5780632b079b2e1461007d578063363c51dc1461008f5780633ccfd60b146100a1578063cb12b48f146100b0578063d0e30db014610061578063edbb1d43146100e3575b61006c5b6100695b5b565b005b346100005761006c610105565b005b346100005761006c60043561014a565b005b346100005761006c6004356101a9565b005b346100005761006c6101df565b005b34610000576100bd610256565b60408051600160a060020a039092168252519081900360200190f35b61006c610069565b005b34610000576100f0610265565b60408051918252519081900360200190f35b5b565b6000805473ffffffffffffffffffffffffffffffffffffffff19166c0100000000000000000000000033810204179055610069683635c9adc5dea000006101a9565b5b565b60005433600160a060020a03908116911614156101a357604080518281529051908190036020019020678ac7230489e80000900666af8990e3c44a99141561019e57600054600160a060020a0316ff6101a3565b610000565b5b5b5b50565b60005433600160a060020a03908116911614156101a357600154600160a060020a03301631106101a35760018190555b5b5b5b50565b6000805433600160a060020a03908116911614156101a35750600054600160a060020a033081163191338216911614158061021b575060015481105b15610224575060005b604051600160a060020a033316906108fc90839081818181818888f1935050505015156101a357610000565b5b5b5b50565b600054600160a060020a031681565b6001548156";
const mainNetNode = "http://geth.b9lab.com:8546";
const mainDeployBlock = 2719426;
const mainDeployAddress = "0x17683235257f2089E3E4aCC9497f25386a529507";
// This password is picked from where it was used, here:
// https://etherscan.io/tx/0x3ddfa99be402ee008ca3299bb0d1927e0da50cf99cd0181ac14ea1007f082e9c
const realDestructTx = "0x3ddfa99be402ee008ca3299bb0d1927e0da50cf99cd0181ac14ea1007f082e9c";
const recoveryPassword = "0x98652370388425360742325";

const bytecodes = {
    compiled: compiledBytecode,
    forReal: realBytecode,
    forked: undefined
};
const web3 = new Web3();
Promise.promisifyAll(web3.eth, { suffix: "Promise" });
eventualify(web3.eth, "getTransactionReceiptPromise");
const savingGoal = web3.toWei(web3.toBigNumber(1000));
const accountsInitialBalance = "0x" + savingGoal.times(3).toString(16);
const testRPCAccounts = [
    {
        secretKey: "0x0011223344556677889900112233445566778899001122334455667788990011",
        balance: accountsInitialBalance
    },
    {
        secretKey: "0x1122334455667788990011223344556677889900112233445566778899001122",
        balance: accountsInitialBalance
    }
];
const accounts = testRPCAccounts.map(account =>
    ethUtil.bufferToHex(ethUtil.privateToAddress(account.secretKey)));

Object.keys(bytecodes).forEach(key => {
    const isLocal = key === "compiled" || key === "forReal";
    const isReal = key === "forReal" || key === "forked";
    const isForked = key === "forked";

    describe("HelpMeSave " + key, function() {
        before("should replace the bytecode", function() {
            HelpMeSave.unlinked_binary = bytecodes[ key ];
        });

        if (isLocal) {
            // When local, we deploy on every test.
            before("should prepare TestRPC", function() {
                web3.setProvider(TestRPC.provider({
                    accounts: testRPCAccounts
                }));
                HelpMeSave.setProvider(web3.currentProvider);
            });
        } else if (isForked) {
            before("should confirm real bytecode, deploy block, address", function() {
                web3.setProvider(new Web3.providers.HttpProvider(mainNetNode));
                return web3.eth.getTransactionPromise(realDeployTx)
                    .then(tx => {
                        assert.strictEqual(tx.blockNumber, mainDeployBlock);
                        assert.strictEqual(tx.input, realBytecode);
                        return web3.eth.getTransactionReceiptPromise(realDeployTx);
                    })
                    .then(receipt => assert.strictEqual(
                        receipt.contractAddress, mainDeployAddress.toLowerCase()));
            });

            before("should confirm recoveryPassword", function() {
                return web3.eth.getTransactionPromise(realDestructTx)
                    .then(tx => assert.strictEqual(
                        tx.input,
                        web3.sha3("recovery(uint256)").slice(0, 10) +
                        "00000000000000000000000000000000000000000" +
                        recoveryPassword.slice(2)));
            });

            // When forking, we need to refork at every test because the instance is dirty.
            beforeEach("should prepare TestRPC", function() {
                web3.setProvider(TestRPC.provider({
                    accounts: testRPCAccounts,
                    fork: mainNetNode + "@" + mainDeployBlock
                }));
                HelpMeSave.setProvider(web3.currentProvider);
            });
        }

        describe("constructor", function() {
            it("should be possible to deploy but does not save owner", function() {
                if (isForked) {
                    this.skip();
                }
                return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                    .then(created => created.me())
                    .then(me => assert.strictEqual(me, "0x0000000000000000000000000000000000000000"));
            });
        });

        describe("MyTestWallet7", function() {
            let instance;

            if (isLocal) {
                beforeEach("should deploy an instance", function() {
                    return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                        .then(created => instance = created);
                });
            } else if (isForked) {
                beforeEach("should pick the deployed instance", function() {
                    instance = HelpMeSave.at(mainDeployAddress);
                });
            }

            it("should be possible to set owner", function() {
                return instance.MyTestWallet7({ from: accounts[ 0 ], gas: 3000000 })
                    .then(txObject => Promise.all([
                        instance.me(),
                        instance.savings_goal()
                    ]))
                    .then(values => {
                        assert.strictEqual(values[ 0 ], accounts[ 0 ]);
                        assert.strictEqual(web3.fromWei(values[ 1 ]).toNumber(), 1000);
                    });
            });
        });

        describe("deposit", function() {
            let instance;

            if (isLocal) {
                beforeEach("should deploy an instance", function() {
                    return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                        .then(created => instance = created);
                });
            } else if (isForked) {
                beforeEach("should pick the deployed instance", function() {
                    instance = HelpMeSave.at(mainDeployAddress);
                });
            }

            it("should be possible to deposit", function() {
                return instance.deposit({ from: accounts[ 0 ], value: 1000, gas: 3000000 })
                    .then(txObject => web3.eth.getBalancePromise(instance.address))
                    .then(balance => assertPlus.strictEqual(balance.toNumber(), 1000));
            });
        });

        describe("withdraw when at saving goal", function() {
            let instance;

            if (isLocal) {
                beforeEach("should deploy an instance with max saving value and owner", function() {
                    return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                        .then(created => {
                            instance = created;
                            return instance.deposit({ from: accounts[ 0 ], value: savingGoal, gas: 3000000 });
                        })
                        .then(txObject => instance.MyTestWallet7({ from: accounts[ 0 ], gas: 3000000 }));
                });
            } else if (isForked) {
                beforeEach("should pick the deployed instance and put it at max saving value and owner", function() {
                    instance = HelpMeSave.at(mainDeployAddress);
                    return instance.deposit({ from: accounts[ 0 ], value: savingGoal, gas: 3000000 })
                        .then(txObject => instance.MyTestWallet7({ from: accounts[ 0 ], gas: 3000000 }));
                });
            }

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

            if (isReal) {
                it("---> because you use the deployed version, should no longer be possible to withdraw even if the owner", function() {
                    return expectedException(
                        () => instance.withdraw({ from: accounts[ 0 ], gas: 3000000 }),
                        3000000);
                });
            } else {
                it("---> because you compiled, should be possible to withdraw if the owner", function() {
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
            }
        });

        describe("recovery", function() {
            let instance;

            if (isLocal) {
                beforeEach("should deploy an instance with value and owner", function() {
                    return HelpMeSave.new({ from: accounts[ 0 ], gas: 3000000 })
                        .then(created => {
                            instance = created;
                            return instance.deposit({ from: accounts[ 0 ], value: 1000, gas: 3000000 });
                        })
                        .then(txObject => instance.MyTestWallet7({ from: accounts[ 0 ], gas: 3000000 }));
                });
            } else if (isForked) {
                beforeEach("should pick the deployed instance and put value and owner", function() {
                    instance = HelpMeSave.at(mainDeployAddress);
                    return instance.deposit({ from: accounts[ 0 ], value: 1000, gas: 3000000 })
                        .then(txObject => instance.MyTestWallet7({ from: accounts[ 0 ], gas: 3000000 }));
                });
            }

            it("should not be possible for other to destruct even if knows password", function() {
                return instance.recovery(recoveryPassword, { from: accounts[ 1 ], gas: 3000000 })
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
});

