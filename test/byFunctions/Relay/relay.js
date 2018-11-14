var RLC          = artifacts.require("../node_modules/rlc-token//contracts/RLC.sol");
var IexecHub     = artifacts.require("./IexecHub.sol");
var IexecClerk   = artifacts.require("./IexecClerk.sol");
var DappRegistry = artifacts.require("./DappRegistry.sol");
var DataRegistry = artifacts.require("./DataRegistry.sol");
var PoolRegistry = artifacts.require("./PoolRegistry.sol");
var Dapp         = artifacts.require("./Dapp.sol");
var Data         = artifacts.require("./Data.sol");
var Pool         = artifacts.require("./Pool.sol");
var Relay        = artifacts.require("./Relay.sol");
var Broker       = artifacts.require("./Broker.sol");

const Web3      = require('web3')
const constants = require("../../constants");
const odbtools  = require('../../../utils/odb-tools');

const wallets   = require('../../wallets');

function extractEvents(txMined, address, name)
{
	return txMined.logs.filter((ev) => { return ev.address == address && ev.event == name });
}

contract('IexecHub', async (accounts) => {

	assert.isAtLeast(accounts.length, 10, "should have at least 10 accounts");
	let iexecAdmin    = accounts[0];
	let dappProvider  = accounts[1];
	let dataProvider  = accounts[2];
	let poolScheduler = accounts[3];
	let poolWorker1   = accounts[4];
	let poolWorker2   = accounts[5];
	let poolWorker3   = accounts[6];
	let poolWorker4   = accounts[7];
	let user          = accounts[8];
	let sgxEnclave    = accounts[9];

	var RLCInstance          = null;
	var IexecHubInstance     = null;
	var IexecClerkInstance   = null;
	var DappRegistryInstance = null;
	var DataRegistryInstance = null;
	var PoolRegistryInstance = null;
	var RelayInstance        = null;
	var BrokerInstance       = null;

	var DappInstance = null;
	var DataInstance = null;
	var PoolInstance = null;

	var dapporder = null;
	var dataorder = null;
	var poolorder = null;
	var userorder = null;
	var dealid    = null;
	var taskid    = null;

	var authorizations = {};
	var results        = {};
	var consensus      = null;
	var workers        = [];

	/***************************************************************************
	 *                        Environment configuration                        *
	 ***************************************************************************/
	before("configure", async () => {
		console.log("# web3 version:", web3.version);

		workers = [
			{ address: poolWorker1, enclave: sgxEnclave,             raw: "iExec the wanderer" },
			{ address: poolWorker2, enclave: constants.NULL.ADDRESS, raw: "iExec the wanderer" },
		];
		consensus = "iExec the wanderer";

		/**
		 * Retreive deployed contracts
		 */
		RLCInstance          = await RLC.deployed();
		IexecHubInstance     = await IexecHub.deployed();
		IexecClerkInstance   = await IexecClerk.deployed();
		DappRegistryInstance = await DappRegistry.deployed();
		DataRegistryInstance = await DataRegistry.deployed();
		PoolRegistryInstance = await PoolRegistry.deployed();
		RelayInstance        = await Relay.deployed();
		BrokerInstance       = await Broker.deployed();

		odbtools.setup({
			name:              "iExecODB",
			version:           "3.0-alpha",
			chainId:           await web3.eth.net.getId(),
			verifyingContract: IexecClerkInstance.address,
		});

		/**
		 * For ABIEncoderV2
		 */
		web3 = new Web3(web3.currentProvider);
		IexecHubInstanceBeta   = new web3.eth.Contract(IexecHub.abi,   IexecHubInstance.address  );
		IexecClerkInstanceBeta = new web3.eth.Contract(IexecClerk.abi, IexecClerkInstance.address);
		RelayInstanceBeta      = new web3.eth.Contract(Relay.abi,      RelayInstance.address     );

		/**
		 * Token distribution
		 */
		assert.equal(await RLCInstance.owner(), iexecAdmin, "iexecAdmin should own the RLC smart contract");
		txsMined = await Promise.all([
			RLCInstance.transfer(dappProvider,  1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(dataProvider,  1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(poolScheduler, 1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(poolWorker1,   1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(poolWorker2,   1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(poolWorker3,   1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(poolWorker4,   1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.transfer(user,          1000000000, { from: iexecAdmin, gas: constants.AMOUNT_GAS_PROVIDED })
		]);
		assert.isBelow(txsMined[0].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[1].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[2].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[3].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[4].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[5].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[6].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[7].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");

		let balances = await Promise.all([
			RLCInstance.balanceOf(dappProvider),
			RLCInstance.balanceOf(dataProvider),
			RLCInstance.balanceOf(poolScheduler),
			RLCInstance.balanceOf(poolWorker1),
			RLCInstance.balanceOf(poolWorker2),
			RLCInstance.balanceOf(poolWorker3),
			RLCInstance.balanceOf(poolWorker4),
			RLCInstance.balanceOf(user)
		]);
		assert.equal(balances[0], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[1], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[2], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[3], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[4], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[5], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[6], 1000000000, "1000000000 nRLC here");
		assert.equal(balances[7], 1000000000, "1000000000 nRLC here");

		txsMined = await Promise.all([
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: dappProvider,  gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: dataProvider,  gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: poolScheduler, gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: poolWorker1,   gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: poolWorker2,   gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: poolWorker3,   gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: poolWorker4,   gas: constants.AMOUNT_GAS_PROVIDED }),
			RLCInstance.approve(IexecClerkInstance.address, 1000000, { from: user,          gas: constants.AMOUNT_GAS_PROVIDED })
		]);
		assert.isBelow(txsMined[0].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[1].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[2].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[3].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[4].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[5].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[6].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		assert.isBelow(txsMined[7].receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
	});

	/***************************************************************************
	 *                  TEST: Dapp creation (by dappProvider)                  *
	 ***************************************************************************/
	it("[Genesis] Dapp Creation", async () => {
		txMined = await DappRegistryInstance.createDapp(dappProvider, "R Clifford Attractors", constants.DAPP_PARAMS_EXAMPLE, constants.NULL.BYTES32, { from: dappProvider });
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		events = extractEvents(txMined, DappRegistryInstance.address, "CreateDapp");
		DappInstance = await Dapp.at(events[0].args.dapp);
	});

	/***************************************************************************
	 *                  TEST: Data creation (by dataProvider)                  *
	 ***************************************************************************/
	it("[Genesis] Data Creation", async () => {
		txMined = await DataRegistryInstance.createData(dataProvider, "Pi", "3.1415926535", constants.NULL.BYTES32, { from: dataProvider });
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		events = extractEvents(txMined, DataRegistryInstance.address, "CreateData");
		DataInstance = await Data.at(events[0].args.data);
	});

	/***************************************************************************
	 *                 TEST: Pool creation (by poolScheduler)                  *
	 ***************************************************************************/
	it("[Genesis] Pool Creation", async () => {
		txMined = await PoolRegistryInstance.createPool(
			poolScheduler,
			"A test workerpool",
			10, // lock
			10, // minimum stake
			10, // minimum score
			{ from: poolScheduler }
		);
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
		events = extractEvents(txMined, PoolRegistryInstance.address, "CreatePool");
		PoolInstance = await Pool.at(events[0].args.pool);
	});

	/***************************************************************************
	 *               TEST: Pool configuration (by poolScheduler)               *
	 ***************************************************************************/
	it("[Genesis] Pool Configuration", async () => {
		txMined = await PoolInstance.changePoolPolicy(
			35,  // worker stake ratio
			5,   // scheduler reward ratio
			100, // minimum stake
			0,   // minimum score
			{ from: poolScheduler }
		);
		assert.isBelow(txMined.receipt.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");
	});

	/***************************************************************************
	 *              TEST: Dapp order signature (by dappProvider)               *
	 ***************************************************************************/
	it("[Genesis] Generate dapp order", async () => {
		dapporder = odbtools.signDappOrder(
			{
				dapp:         DappInstance.address,
				dappprice:    3,
				volume:       1000,
				tag:          0,
				datarestrict: constants.NULL.ADDRESS,
				poolrestrict: constants.NULL.ADDRESS,
				userrestrict: constants.NULL.ADDRESS,
				salt:         web3.utils.randomHex(32),
				sign:         constants.NULL.SIGNATURE,
			},
			wallets.addressToPrivate(dappProvider)
		);
		assert.isTrue(
			await IexecClerkInstanceBeta.methods.verify(
				dappProvider,
				odbtools.DappOrderStructHash(dapporder),
				dapporder.sign
			).call(),
			"Error with the validation of the dapporder signature"
		);
	});

	/***************************************************************************
	 *              TEST: Data order signature (by dataProvider)               *
	 ***************************************************************************/
	it("[Genesis] Generate data order", async () => {
		dataorder = odbtools.signDataOrder(
			{
				data:         DataInstance.address,
				dataprice:    1,
				volume:       1000,
				tag:          0,
				dapprestrict: constants.NULL.ADDRESS,
				poolrestrict: constants.NULL.ADDRESS,
				userrestrict: constants.NULL.ADDRESS,
				salt:         web3.utils.randomHex(32),
				sign:         constants.NULL.SIGNATURE,
			},
			wallets.addressToPrivate(dataProvider)
		);
		assert.isTrue(
			await IexecClerkInstanceBeta.methods.verify(
				dataProvider,
				odbtools.DataOrderStructHash(dataorder),
				dataorder.sign
			).call(),
			"Error with the validation of the dataorder signature"
		);
	});

	/***************************************************************************
	 *              TEST: Pool order signature (by poolProvider)               *
	 ***************************************************************************/
	it("[Genesis] Generate pool order", async () => {
		poolorder = odbtools.signPoolOrder(
			{
				pool:         PoolInstance.address,
				poolprice:    25,
				volume:       3,
				tag:          0,
				category:     4,
				trust:        1000,
				dapprestrict: constants.NULL.ADDRESS,
				datarestrict: constants.NULL.ADDRESS,
				userrestrict: constants.NULL.ADDRESS,
				salt:         web3.utils.randomHex(32),
				sign:         constants.NULL.SIGNATURE,
			},
			wallets.addressToPrivate(poolScheduler)
		);
		assert.isTrue(
			await IexecClerkInstanceBeta.methods.verify(
				poolScheduler,
				odbtools.PoolOrderStructHash(poolorder),
				poolorder.sign
			).call(),
			"Error with the validation of the poolorder signature"
		);
	});

	/***************************************************************************
	 *                  TEST: User order signature (by user)                   *
	 ***************************************************************************/
	it("[Genesis] Generate user order", async () => {
		userorder = odbtools.signUserOrder(
			{
				dapp:         DappInstance.address,
				dappmaxprice: 3,
				data:         DataInstance.address,
				datamaxprice: 1,
				pool:         constants.NULL.ADDRESS,
				poolmaxprice: 25,
				volume:       1, // CHANGE FOR BOT
				tag:          0,
				category:     4,
				trust:        1000,
				requester:    user,
				beneficiary:  user,
				callback:     constants.NULL.ADDRESS,
				params:       "<parameters>",
				salt:         web3.utils.randomHex(32),
				sign:         constants.NULL.SIGNATURE,
			},
			wallets.addressToPrivate(user)
		);
		assert.isTrue(
			await IexecClerkInstanceBeta.methods.verify(
				user,
				odbtools.UserOrderStructHash(userorder),
				userorder.sign
			).call(),
			"Error with the validation of the userorder signature"
		);
	});

	it("[LOG] show order", async () => {
		// console.log("=== dapporder ===");
		// console.log(dapporder);
		// console.log("=== dataorder ===");
		// console.log(dataorder);
		// console.log("=== poolorder ===");
		// console.log(poolorder);
		// console.log("=== userorder ===");
		// console.log(userorder);
	});

	it(">> broadcastDappOrder", async () => {
		txMined = await RelayInstanceBeta.methods.broadcastDappOrder(dapporder).send({ from: user, gasLimit: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");

		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.dapp,         dapporder.dapp,         "error");
		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.dappprice,    dapporder.dappprice,    "error");
		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.volume,       dapporder.volume,       "error");
		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.datarestrict, dapporder.datarestrict, "error");
		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.poolrestrict, dapporder.poolrestrict, "error");
		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.userrestrict, dapporder.userrestrict, "error");
		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.salt,         dapporder.salt,         "error");
		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.sign.v,       dapporder.sign.v,       "error");
		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.sign.r,       dapporder.sign.r,       "error");
		assert.equal(txMined.events.BroadcastDappOrder.returnValues.dapporder.sign.s,       dapporder.sign.s,       "error");
	});

	it(">> broadcastDataOrder", async () => {
		txMined = await RelayInstanceBeta.methods.broadcastDataOrder(dataorder).send({ from: user, gasLimit: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");

		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.data,         dataorder.data,         "error");
		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.dataprice,    dataorder.dataprice,    "error");
		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.volume,       dataorder.volume,       "error");
		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.dapprestrict, dataorder.dapprestrict, "error");
		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.poolrestrict, dataorder.poolrestrict, "error");
		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.userrestrict, dataorder.userrestrict, "error");
		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.salt,         dataorder.salt,         "error");
		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.sign.v,       dataorder.sign.v,       "error");
		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.sign.r,       dataorder.sign.r,       "error");
		assert.equal(txMined.events.BroadcastDataOrder.returnValues.dataorder.sign.s,       dataorder.sign.s,       "error");
	});

	it(">> broadcastPoolOrder", async () => {
		txMined = await RelayInstanceBeta.methods.broadcastPoolOrder(poolorder).send({ from: user, gasLimit: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");

		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.pool,         poolorder.pool,         "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.poolprice,    poolorder.poolprice,    "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.volume,       poolorder.volume,       "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.category,     poolorder.category,     "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.trust,        poolorder.trust,        "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.tag,          poolorder.tag,          "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.dapprestrict, poolorder.dapprestrict, "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.datarestrict, poolorder.datarestrict, "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.userrestrict, poolorder.userrestrict, "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.salt,         poolorder.salt,         "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.sign.v,       poolorder.sign.v,       "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.sign.r,       poolorder.sign.r,       "error");
		assert.equal(txMined.events.BroadcastPoolOrder.returnValues.poolorder.sign.s,       poolorder.sign.s,       "error");
	});

	it(">> broadcastUserOrder", async () => {
		txMined = await RelayInstanceBeta.methods.broadcastUserOrder(userorder).send({ from: user, gasLimit: constants.AMOUNT_GAS_PROVIDED });
		assert.isBelow(txMined.gasUsed, constants.AMOUNT_GAS_PROVIDED, "should not use all gas");

		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.dapp,         userorder.dapp,         "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.dappmaxprice, userorder.dappmaxprice, "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.data,         userorder.data,         "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.datamaxprice, userorder.datamaxprice, "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.pool,         userorder.pool,         "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.poolmaxprice, userorder.poolmaxprice, "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.volume,       userorder.volume,       "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.category,     userorder.category,     "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.trust,        userorder.trust,        "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.tag,          userorder.tag,          "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.requester,    userorder.requester,    "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.beneficiary,  userorder.beneficiary,  "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.callback,     userorder.callback,     "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.params,       userorder.params,       "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.salt,         userorder.salt,         "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.sign.v,       userorder.sign.v,       "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.sign.r,       userorder.sign.r,       "error");
		assert.equal(txMined.events.BroadcastUserOrder.returnValues.userorder.sign.s,       userorder.sign.s,       "error");
	});

});