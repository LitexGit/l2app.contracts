const mnemonic =
  "member guess canvas moment boring tragic find thumb cart identify above dutch"; // put your ganache mnemonic here.

const bip39 = require("bip39");
const hdkey = require("ethereumjs-wallet/hdkey");
const wallet = require("ethereumjs-wallet");

// console.log(getAccountPrivateKey(0));

async function getAccountPrivateKey(index) {
  const seed = await bip39.mnemonicToSeed(mnemonic); // mnemonic is the string containing the words
  console.log("seed", seed);
  const hdk = hdkey.fromMasterSeed(seed);
  const addr_node = hdk.derivePath("m/44'/60'/0'/0/" + index); //m/44'/60'/0'/0/0 is derivation path for the first account. m/44'/60'/0'/0/1 is the derivation path for the second account and so on
  const addr = addr_node.getWallet().getAddressString(); //check that this is the same with the address that ganache list for the first account to make sure the derivation is correct
  const private_key = addr_node
    .getWallet()
    .getPrivateKey()
    .toString("hex");
  // console.log(private_key);
  return private_key;
}

async function getPrivateKeys() {
  // const providerPrivateKey = Buffer.from(
  //   "15b38136d1e820d1847ad857a4c5b89db0c2e531179dfd32d5c21dc53a844845",
  //   "hex"
  // );
  // const regulatorPrivateKey = Buffer.from(
  //   "76bb8fb96acc3671278a5c1dc388cf3f90364547ad1f7b8b5a0db12f4556c00a",
  //   "hex"
  // );
  // const userPrivateKey = Buffer.from(
  //   "437cd862a77837a80a6f16fb1cf30eb27195680ad8506cf43eb23d655184ade6",
  //   "hex"
  // );
  const providerPrivateKey = Buffer.from(await getAccountPrivateKey(0), "hex");
  const regulatorPrivateKey = Buffer.from(await getAccountPrivateKey(1), "hex");
  const userPrivateKey = Buffer.from(await getAccountPrivateKey(2), "hex");

  return { providerPrivateKey, regulatorPrivateKey, userPrivateKey };
}

async function getPuppetAccounts(accounts) {
  const puppetAddrs = [
    accounts[4],
    accounts[5],
    accounts[6],
    accounts[7],
    accounts[8]
  ];
  const puppetPrivates = [
    Buffer.from(await getAccountPrivateKey(4), "hex"),
    Buffer.from(await getAccountPrivateKey(5), "hex"),
    Buffer.from(await getAccountPrivateKey(6), "hex"),
    Buffer.from(await getAccountPrivateKey(7), "hex"),
    Buffer.from(await getAccountPrivateKey(8), "hex")
  ];
  return { puppetAddrs, puppetPrivates };
}

module.exports = {
  getPrivateKeys,
  getPuppetAccounts
};
