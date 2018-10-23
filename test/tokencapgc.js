import * as helpers from "./helpers";
const DAOToken = artifacts.require("./DAOToken.sol");
const TokenCapGC = artifacts.require("./globalConstraints/TokenCapGC.sol");
const Controller = artifacts.require("./Controller.sol");
const Reputation = artifacts.require("./Reputation.sol");
const Avatar = artifacts.require("./Avatar.sol");
const ActorsFactory = artifacts.require("./ActorsFactory.sol");
const ControllerFactory = artifacts.require("./ControllerFactory.sol");
var constants = require("../test/constants");

let reputation, avatar, token, controller, actorsFactory;
const setup = async function(permission = "0") {
  var _controller;

  // set up a reputation system
  reputation = await Reputation.new();

  token = await DAOToken.at(
    (await actorsFactory.createDAOToken("TEST", "TST", 0)).logs[0].args
      .newTokenAddress
  );

  avatar = await Avatar.at(
    (await actorsFactory.createAvatar(
      "name",
      token.address,
      reputation.address
    )).logs[0].args.newAvatarAddress
  );

  var controller = await Controller.new({
    gas: constants.ARC_GAS_LIMIT
  });

  var controllerFactory = await ControllerFactory.new(controller.address, {
    gas: constants.ARC_GAS_LIMIT
  });

  if (permission !== "0") {
    _controller = await Controller.at(
      (await controllerFactory.createController(avatar.address, {
        from: accounts[1],
        gas: constants.ARC_GAS_LIMIT
      })).logs[0].args.newControllerAddress
    );
    await _controller.registerScheme(accounts[0], 0, permission, 0, {
      from: accounts[1]
    });
    await _controller.unregisterSelf(0, { from: accounts[1] });
  } else {
    _controller = await Controller.at(
      (await controllerFactory.createController(avatar.address, {
        gas: constants.ARC_GAS_LIMIT
      })).logs[0].args.newControllerAddress
    );
  }
  controller = _controller;
  return _controller;
};

contract("TokenCapGC", accounts => {
  it("setParameters", async () => {
    var avatarLibrary = await Avatar.new({ gas: constants.ARC_GAS_LIMIT });
    var daoTokenLibrary = await DAOToken.new({ gas: constants.ARC_GAS_LIMIT });

    actorsFactory = await ActorsFactory.new(
      avatarLibrary.address,
      daoTokenLibrary.address,
      { gas: constants.ARC_GAS_LIMIT }
    );

    var paramsHash;
    var tokenCapGC = await TokenCapGC.new();
    var token = await DAOToken.at(
      (await actorsFactory.createDAOToken("TEST", "TST", 0)).logs[0].args
        .newTokenAddress
    );
    await tokenCapGC.setParameters(token.address, 100);
    paramsHash = await tokenCapGC.getParametersHash(token.address, 100);
    var param = await tokenCapGC.parameters(paramsHash);
    assert.equal(param[1].toNumber(), 100);
  });

  it("pre and post", async () => {
    var paramsHash, post, pre;
    var tokenCapGC = await TokenCapGC.new();
    var token = await DAOToken.at(
      (await actorsFactory.createDAOToken("TEST", "TST", 0)).logs[0].args
        .newTokenAddress
    );
    await tokenCapGC.setParameters(token.address, 100);
    paramsHash = await tokenCapGC.getParametersHash(token.address, 100);
    pre = await tokenCapGC.pre(token.address, paramsHash, helpers.NULL_HASH);
    assert.equal(pre, true);
    post = await tokenCapGC.post(token.address, paramsHash, helpers.NULL_HASH);
    //token total supply is 0
    assert.equal(post, true);
    //increase the total supply
    await token.mint(accounts[2], 101);
    post = await tokenCapGC.post(token.address, paramsHash, helpers.NULL_HASH);
    //token total supply is 101
    assert.equal(post, false);
  });

  it("post with wrong paramHash", async () => {
    var post;
    var tokenCapGC = await TokenCapGC.new();
    var token = await DAOToken.at(
      (await actorsFactory.createDAOToken("TEST", "TST", 0)).logs[0].args
        .newTokenAddress
    );
    await tokenCapGC.setParameters(token.address, 100);
    await tokenCapGC.getParametersHash(token.address, 100);
    post = await tokenCapGC.post(token.address, "0x0001", helpers.NULL_HASH);
    //token total supply is 0
    assert.equal(post, true);
    //increase the total supply
    await token.mint(accounts[2], 101);
    post = await tokenCapGC.post(token.address, "0x0001", helpers.NULL_HASH);
    //token total supply is 101
    assert.equal(post, true);
  });

  it("mintTokens check", async () => {
    controller = await setup();
    var tokenCapGC = await TokenCapGC.new();
    await tokenCapGC.setParameters(token.address, 100);
    var tokenCapGCParamsHash = await tokenCapGC.getParametersHash(
      token.address,
      100
    );
    await controller.addGlobalConstraint(
      tokenCapGC.address,
      tokenCapGCParamsHash
    );
    //var globalConstraints = await constraint("mintTokens");
    await token.transferOwnership(controller.address);
    await controller.mintTokens(50, accounts[0]);
    try {
      await controller.mintTokens(51, accounts[0]);
      assert(
        false,
        "mint tokens should fail due to the tokenCapGC global constraint "
      );
    } catch (ex) {
      helpers.assertVMException(ex);
    }
  });
});
