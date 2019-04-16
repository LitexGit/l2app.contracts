const PacketVerify = artifacts.require("PacketVerify");

module.exports = function(deployer) {
  deployer.deploy(PacketVerify);
};
