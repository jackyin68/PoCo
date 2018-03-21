var RLC            = artifacts.require("../node_modules/rlc-token//contracts/RLC.sol");
var IexecHub       = artifacts.require("./IexecHub.sol");
var WorkerPoolHub  = artifacts.require("./WorkerPoolHub.sol");
var AppHub         = artifacts.require("./AppHub.sol");
var DatasetHub     = artifacts.require("./DatasetHub.sol");
var WorkerPool     = artifacts.require("./WorkerPool.sol");
var AuthorizedList = artifacts.require("./AuthorizedList.sol");
var App            = artifacts.require("./App.sol");
var WorkOrder      = artifacts.require("./WorkOrder.sol");
var Marketplace    = artifacts.require("./Marketplace.sol");

const BN              = require("bn");
const keccak256       = require("solidity-sha3");
const Promise         = require("bluebird");
const fs              = require("fs-extra");
//extensions.js : credit to : https://github.com/coldice/dbh-b9lab-hackathon/blob/development/truffle/utils/extensions.js
const Extensions      = require("../../../utils/extensions.js");
const addEvmFunctions = require("../../../utils/evmFunctions.js");
const readFileAsync = Promise.promisify(fs.readFile);

addEvmFunctions(web3);
Promise.promisifyAll(web3.eth,     { suffix: "Promise" });
Promise.promisifyAll(web3.version, { suffix: "Promise" });
Promise.promisifyAll(web3.evm,     { suffix: "Promise" });
Extensions.init(web3, assert);
var constants = require("../../constants");

contract('IexecHub', function(accounts) {

	let scheduleProvider, resourceProvider, appProvider, datasetProvider, dappUser, dappProvider, iExecCloudUser, marketplaceCreator;
	let subscriptionLockStakePolicy    = 0;
	let subscriptionMinimumStakePolicy = 10;
	let subscriptionMinimumScorePolicy = 0;
	let isTestRPC;
	let txMined;
	let txsMined;
	let testTimemout = 0;
	let aRLCInstance;
	let aIexecHubInstance;
	let aWorkerPoolHubInstance;
	let aAppHubInstance;
	let aDatasetHubInstance;
	let aMarketplaceInstance;


	beforeEach("should prepare accounts and check TestRPC Mode",async () => {
		assert.isAtLeast(accounts.length, 8, "should have at least 8 accounts");
		scheduleProvider   = accounts[0];
		resourceProvider   = accounts[1];
		appProvider        = accounts[2];
		datasetProvider    = accounts[3];
		dappUser           = accounts[4];
		dappProvider       = accounts[5];
		iExecCloudUser     = accounts[6];
		marketplaceCreator = accounts[7];

		// INIT ACCOUNTS
		await Extensions.makeSureAreUnlocked([scheduleProvider, resourceProvider, appProvider, datasetProvider, dappUser, dappProvider, iExecCloudUser]);
		let balance=await web3.eth.getBalancePromise(scheduleProvider);
		assert.isTrue(
			web3.toWei(web3.toBigNumber(80), "ether").lessThan(balance),
			"dappProvider should have at least 80 ether, not " + web3.fromWei(balance, "ether")
		);
		await Extensions.refillAccount(scheduleProvider, resourceProvider,   10);
		await Extensions.refillAccount(scheduleProvider, appProvider,        10);
		await Extensions.refillAccount(scheduleProvider, datasetProvider,    10);
		await Extensions.refillAccount(scheduleProvider, dappUser,           10);
		await Extensions.refillAccount(scheduleProvider, dappProvider,       10);
		await Extensions.refillAccount(scheduleProvider, iExecCloudUser,     10);
		await Extensions.refillAccount(scheduleProvider, marketplaceCreator, 10);
		let node = await web3.version.getNodePromise();
		isTestRPC = node.indexOf("EthereumJS TestRPC") >= 0;
		// INIT RLC
		aRLCInstance = await RLC.new({ from: marketplaceCreator, gas: constants.AMOUNT_GAS_PROVIDED });
		console.log("aRLCInstance.address is ");
		console.log(aRLCInstance.address);
		let txMined = await aRLCInstance.unlock({ from: marketplaceCreator, gas: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		//INIT ACCOUNTS WITH RLC
		txsMined = await Promise.all([
			aRLCInstance.transfer(scheduleProvider, 1000, { from: marketplaceCreator, gas: constants.AMOUNT_GAS_PROVIDED }),
			aRLCInstance.transfer(resourceProvider, 1000, { from: marketplaceCreator, gas: constants.AMOUNT_GAS_PROVIDED }),
			aRLCInstance.transfer(appProvider,      1000, { from: marketplaceCreator, gas: constants.AMOUNT_GAS_PROVIDED }),
			aRLCInstance.transfer(datasetProvider,  1000, { from: marketplaceCreator, gas: constants.AMOUNT_GAS_PROVIDED }),
			aRLCInstance.transfer(dappUser,         1000, { from: marketplaceCreator, gas: constants.AMOUNT_GAS_PROVIDED }),
			aRLCInstance.transfer(dappProvider,     1000, { from: marketplaceCreator, gas: constants.AMOUNT_GAS_PROVIDED }),
			aRLCInstance.transfer(iExecCloudUser,   1000, { from: marketplaceCreator, gas: constants.AMOUNT_GAS_PROVIDED })
		]);
		assert.isBelow(txsMined[0].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[1].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[2].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[3].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[4].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[5].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[6].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		let balances = await  Promise.all([
			aRLCInstance.balanceOf(scheduleProvider),
			aRLCInstance.balanceOf(resourceProvider),
			aRLCInstance.balanceOf(appProvider),
			aRLCInstance.balanceOf(datasetProvider),
			aRLCInstance.balanceOf(dappUser),
			aRLCInstance.balanceOf(dappProvider),
			aRLCInstance.balanceOf(iExecCloudUser)
		]);
		assert.strictEqual(balances[0].toNumber(), 1000, "1000 nRLC here");
		assert.strictEqual(balances[1].toNumber(), 1000, "1000 nRLC here");
		assert.strictEqual(balances[2].toNumber(), 1000, "1000 nRLC here");
		assert.strictEqual(balances[3].toNumber(), 1000, "1000 nRLC here");
		assert.strictEqual(balances[4].toNumber(), 1000, "1000 nRLC here");
		assert.strictEqual(balances[5].toNumber(), 1000, "1000 nRLC here");
		assert.strictEqual(balances[6].toNumber(), 1000, "1000 nRLC here");

		// INIT SMART CONTRACTS BY marketplaceCreator
		aWorkerPoolHubInstance = await WorkerPoolHub.new({
			from: marketplaceCreator
		});
		console.log("aWorkerPoolHubInstance.address is ");
		console.log(aWorkerPoolHubInstance.address);

		aAppHubInstance = await AppHub.new({
			from: marketplaceCreator
		});
		console.log("aAppHubInstance.address is ");
		console.log(aAppHubInstance.address);

		aDatasetHubInstance = await DatasetHub.new({
			from: marketplaceCreator
		});
		console.log("aDatasetHubInstance.address is ");
		console.log(aDatasetHubInstance.address);

		aIexecHubInstance = await IexecHub.new(aRLCInstance.address, aWorkerPoolHubInstance.address, aAppHubInstance.address, aDatasetHubInstance.address, {
			from: marketplaceCreator
		});
		console.log("aIexecHubInstance.address is ");
		console.log(aIexecHubInstance.address);

		txMined = await aWorkerPoolHubInstance.transferOwnership(aIexecHubInstance.address, {
			from: marketplaceCreator
		});
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		console.log("transferOwnership of WorkerPoolHub to IexecHub");

		txMined = await aAppHubInstance.transferOwnership(aIexecHubInstance.address, {
			from: marketplaceCreator
		});
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		console.log("transferOwnership of AppHub to IexecHub");

		txMined = await aDatasetHubInstance.transferOwnership(aIexecHubInstance.address, {
			from: marketplaceCreator
		});
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		console.log("transferOwnership of DatasetHub to IexecHub");

		aMarketplaceInstance = await Marketplace.new(aIexecHubInstance.address,{
			from: marketplaceCreator
		});
		console.log("aMarketplaceInstance.address is ");
		console.log(aMarketplaceInstance.address);
	});

	it("reward : nobody can call reward : reward internal function", async function() {
    assert.strictEqual(aIexecHubInstance.contract.reward, undefined, "expected reward internal");
  });

	it("seize : nobody can call seize : seize internal function", async function() {
    assert.strictEqual(aIexecHubInstance.contract.seize, undefined, "expected seize internal");
  });

	it("lock : nobody can call lock : lock internal function", async function() {
    assert.strictEqual(aIexecHubInstance.contract.lock, undefined, "expected lock internal");
  });

	it("unlock : nobody can call unlock : unlock internal function", async function() {
    assert.strictEqual(aIexecHubInstance.contract.unlock, undefined, "expected unlock internal");
  });

	it("lockDeposit : nobody can call lockDeposit : lockDeposit internal function", async function() {
    assert.strictEqual(aIexecHubInstance.contract.lockDeposit, undefined, "expected lockDeposit internal");
  });

	it("emitWorkOrder : nobody can call emitWorkOrder : emitWorkOrder internal function", async function() {
    assert.strictEqual(aIexecHubInstance.contract.emitWorkOrder, undefined, "expected emitWorkOrder internal");
  });

	it("lockWorkOrderCost : nobody can call lockWorkOrderCost : lockWorkOrderCost internal function", async function() {
    assert.strictEqual(aIexecHubInstance.contract.lockWorkOrderCost, undefined, "expected lockWorkOrderCost internal");
  });

});
