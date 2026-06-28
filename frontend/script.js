const provider = new ethers.BrowserProvider(window.ethereum, "any");
const REQUIRED_CHAIN_ID = 31337;
let signer;
let vaultContract;
let token0Contract;
let token1Contract;
let token0Decimals = 18;
let token1Decimals = 18;
let isConnecting = false;
let walletConnected = false;
let networkCorrect = false;

function normalizeChainId(chainId) {
  if (typeof chainId === "string") return Number(chainId);
  if (typeof chainId === "bigint") return Number(chainId);
  return chainId;
}

const VAULT_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function deposit(uint256,uint256,uint256,uint256)",
  "function withdraw(uint256,uint256,uint256)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
];

const connectButton = document.getElementById("connectButton");
const loadVaultButton = document.getElementById("loadVaultButton");
const approveButton = document.getElementById("approveButton");
const depositButton = document.getElementById("depositButton");
const withdrawButton = document.getElementById("withdrawButton");
const refreshButton = document.getElementById("refreshButton");

const accountEl = document.getElementById("account");
const chainEl = document.getElementById("chain");
const statusEl = document.getElementById("status");
const vaultNameEl = document.getElementById("vaultName");
const vaultSymbolEl = document.getElementById("vaultSymbol");
const token0AddressEl = document.getElementById("token0Address");
const token1AddressEl = document.getElementById("token1Address");
const shareBalanceEl = document.getElementById("shareBalance");
const totalSupplyEl = document.getElementById("totalSupply");
const token0BalanceEl = document.getElementById("token0Balance");
const token1BalanceEl = document.getElementById("token1Balance");
const logEl = document.getElementById("log");

function log(message) {
  logEl.textContent += `\n${message}`;
  logEl.scrollTop = logEl.scrollHeight;
}

async function connectWallet() {
  if (isConnecting) {
    log("Wallet connection already in progress.");
    return;
  }

  if (!window.ethereum) {
    log("No Web3 provider detected.");
    return;
  }

  isConnecting = true;
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    signer = await provider.getSigner();
    const account = await signer.getAddress();
    const network = await provider.getNetwork();
    const chainId = normalizeChainId(network.chainId);
    accountEl.textContent = account;
    chainEl.textContent = `${chainId}`;
    walletConnected = true;
    networkCorrect = chainId === REQUIRED_CHAIN_ID;
    statusEl.textContent = networkCorrect
      ? `Wallet connected (chain ${chainId})`
      : `Wrong network: ${chainId}`;
    if (!networkCorrect) {
      log("Please switch MetaMask to the local Anvil network (chain 31337). Use the forwarded Codespaces RPC URL if needed.");
    } else {
      log("Wallet connected to local Anvil.");
    }
  } catch (error) {
    walletConnected = false;
    if (error.code === 4001) {
      log("User rejected wallet connection.");
    } else if (error.code === -32002) {
      log("Wallet request already pending. Please check MetaMask.");
    } else {
      log(`Error connecting wallet: ${error.message}`);
    }
  } finally {
    isConnecting = false;
  }
}

async function refreshWalletState() {
  if (!window.ethereum) return;
  try {
    signer = await provider.getSigner();
    const account = await signer.getAddress();
    const network = await provider.getNetwork();
    const chainId = normalizeChainId(network.chainId);
    accountEl.textContent = account;
    chainEl.textContent = `${chainId}`;
    walletConnected = true;
    networkCorrect = chainId === REQUIRED_CHAIN_ID;
    statusEl.textContent = networkCorrect
      ? `Wallet connected (chain ${chainId})`
      : `Wrong network: ${chainId}`;
    if (!networkCorrect) {
      log("Please switch MetaMask to the local Anvil network (chain 31337). Use the forwarded Codespaces RPC URL if needed.");
    } else {
      log("Wallet state refreshed on local Anvil.");
    }
  } catch (error) {
    walletConnected = false;
    statusEl.textContent = "Wallet disconnected";
    log("Wallet disconnected or not authorized.");
  }
}

function formatUnits(value, decimals = 18) {
  return ethers.formatUnits(value, decimals);
}

function parseAmount(value, decimals = 18) {
  if (!value || value.trim() === "") return 0n;
  return ethers.parseUnits(value, decimals);
}

async function loadVault() {
  try {
    const vaultAddress = document.getElementById("vaultAddress").value.trim();
    if (!vaultAddress) {
      log("Please enter the vault address.");
      return;
    }
    if (!ethers.isAddress(vaultAddress)) {
      log("Invalid vault address. Please enter a valid 0x address.");
      return;
    }
    if (!walletConnected || !signer) {
      log("Please connect your wallet first using the Connect Wallet button.");
      return;
    }
    if (!networkCorrect) {
      log("Please switch MetaMask to the local Anvil network (chain 31337) before loading the vault.");
      return;
    }

    const code = await provider.getCode(vaultAddress);
    if (!code || code === "0x") {
      log("No contract code found at this address. Please verify the address and network.");
      return;
    }

    vaultContract = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
    vaultNameEl.textContent = await vaultContract.name();
    vaultSymbolEl.textContent = await vaultContract.symbol();

    const token0Address = await vaultContract.token0();
    const token1Address = await vaultContract.token1();
    token0AddressEl.textContent = token0Address;
    token1AddressEl.textContent = token1Address;

    token0Contract = new ethers.Contract(token0Address, ERC20_ABI, signer ?? provider);
    token1Contract = new ethers.Contract(token1Address, ERC20_ABI, signer ?? provider);
    token0Decimals = await token0Contract.decimals();
    token1Decimals = await token1Contract.decimals();

    await refreshBalances();
    log(`Loaded vault ${vaultAddress}`);
  } catch (error) {
    log(`Error loading vault: ${error.message}`);
  }
}

async function refreshBalances() {
  if (!vaultContract) {
    log("Vault not loaded.");
    return;
  }
  try {
    const account = await signer.getAddress();
    const [shareBalance, totalSupply, token0Balance, token1Balance] = await Promise.all([
      vaultContract.balanceOf(account),
      vaultContract.totalSupply(),
      token0Contract.balanceOf(account),
      token1Contract.balanceOf(account),
    ]);
    shareBalanceEl.textContent = formatUnits(shareBalance, 18);
    totalSupplyEl.textContent = formatUnits(totalSupply, 18);
    token0BalanceEl.textContent = formatUnits(token0Balance, token0Decimals);
    token1BalanceEl.textContent = formatUnits(token1Balance, token1Decimals);
    log("Balances refreshed.");
  } catch (error) {
    log(`Error refreshing balances: ${error.message}`);
  }
}

async function approveTokens() {
  if (!vaultContract) {
    log("Vault not loaded.");
    return;
  }
  try {
    const vaultAddress = vaultContract.address;
    if (!vaultAddress || !ethers.isAddress(vaultAddress)) {
      log("Loaded vault address is invalid.");
      return;
    }
    const token0Approve = await token0Contract.connect(signer).approve(vaultAddress, ethers.MaxUint256);
    log(`Approving token0: ${token0Approve.hash}`);
    await token0Approve.wait();

    const token1Approve = await token1Contract.connect(signer).approve(vaultAddress, ethers.MaxUint256);
    log(`Approving token1: ${token1Approve.hash}`);
    await token1Approve.wait();

    log("Approval complete.");
  } catch (error) {
    log(`Approval failed: ${error.message}`);
  }
}

async function deposit() {
  if (!vaultContract) {
    log("Vault not loaded.");
    return;
  }
  try {
    const amount0 = parseAmount(document.getElementById("depositAmount0").value || "0", token0Decimals);
    const amount1 = parseAmount(document.getElementById("depositAmount1").value || "0", token1Decimals);
    const tx = await vaultContract.connect(signer).deposit(amount0, amount1, 0, 0);
    log(`Deposit transaction submitted: ${tx.hash}`);
    await tx.wait();
    log("Deposit complete.");
    await refreshBalances();
  } catch (error) {
    log(`Deposit failed: ${error.message}`);
  }
}

async function withdraw() {
  if (!vaultContract) {
    log("Vault not loaded.");
    return;
  }
  try {
    const shares = parseAmount(document.getElementById("withdrawShares").value || "0", 18);
    const tx = await vaultContract.connect(signer).withdraw(shares, 0, 0);
    log(`Withdraw transaction submitted: ${tx.hash}`);
    await tx.wait();
    log("Withdraw complete.");
    await refreshBalances();
  } catch (error) {
    log(`Withdraw failed: ${error.message}`);
  }
}

connectButton.addEventListener("click", connectWallet);
loadVaultButton.addEventListener("click", loadVault);
approveButton.addEventListener("click", approveTokens);
depositButton.addEventListener("click", deposit);
withdrawButton.addEventListener("click", withdraw);
refreshButton.addEventListener("click", refreshBalances);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => refreshWalletState());
  window.ethereum.on("chainChanged", () => refreshWalletState());
} else {
  statusEl.textContent = "No Web3 provider detected.";
  log("Install MetaMask or use a browser with injected Ethereum provider.");
}