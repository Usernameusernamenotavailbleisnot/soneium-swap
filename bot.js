const ethers = require('ethers');
const fs = require('fs');
const chalk = require('chalk');

// Configuration
const config = {
    RPC_URL: 'https://soneium.drpc.org',
    CHAIN_ID: 1868,
    QUICKSWAP_ROUTER: '0xeba58c20629ddab41e21a3e4e2422e583ebd9719',
    TOKEN_IN: '0x4200000000000000000000000000000000000006',
    TOKEN_OUT: '0xbA9986D2381edf1DA03B0B9c1f8b00dc4AacC369',
    POOL_FEE: '0x0000000000000000000000000000000000000000',
    DEFAULT_AMOUNT: '0.00002',
    GAS_PRICE_GWEI: '0.01' // Fallback gas price
};

const timeHelper = {
    getTimestamp: () => {
        const now = new Date();
        return `[${now.toLocaleDateString()} ${now.toLocaleTimeString()}]`;
    }
};

const formatHelper = {
    formatEthValue: (wei) => {
        const eth = ethers.utils.formatEther(wei);
        return `${parseFloat(eth).toFixed(6)} ETH`;
    },
    formatUsdcValue: (value) => {
        const usdc = ethers.utils.formatUnits(value, 6);
        return `${parseFloat(usdc).toFixed(6)} USDC`;
    },
    formatGwei: (wei) => {
        return `${ethers.utils.formatUnits(wei, 'gwei')} Gwei`;
    }
};

// Logging functions
const logger = {
    info: (msg) => console.log(chalk.gray(timeHelper.getTimestamp()), chalk.blue(`[INFO] ${msg}`)),
    success: (msg) => console.log(chalk.gray(timeHelper.getTimestamp()), chalk.green(`[SUCCESS] ${msg}`)),
    error: (msg) => console.log(chalk.gray(timeHelper.getTimestamp()), chalk.red(`[ERROR] ${msg}`)),
    warning: (msg) => console.log(chalk.gray(timeHelper.getTimestamp()), chalk.yellow(`[WARNING] ${msg}`)),
    divider: () => console.log(chalk.gray('─'.repeat(50))),
    walletHeader: (address, index) => {
        console.log(chalk.magenta('\n' + '═'.repeat(50)));
        console.log(chalk.gray(timeHelper.getTimestamp()), chalk.magenta(`║ Wallet #${index + 1}: ${address}`));
        console.log(chalk.magenta('═'.repeat(50)));
    }
};

// Gas price helper functions
async function getDynamicGasPrice(provider) {
    try {
        // Get current gas price from network
        const feeData = await provider.getFeeData();
        
        // Use much lower default values
        const baseFee = feeData.lastBaseFeePerGas || ethers.utils.parseUnits('0.008', 'gwei');
        const priorityFee = ethers.utils.parseUnits('0.008', 'gwei'); // Fixed lower priority fee
        
        // Calculate max fee more conservatively
        const maxFeePerGas = baseFee.add(priorityFee);
        
        logger.info(`Dynamic Gas Prices obtained:
        Base Fee: ${formatHelper.formatGwei(baseFee)}
        Priority Fee: ${formatHelper.formatGwei(priorityFee)}
        Max Fee: ${formatHelper.formatGwei(maxFeePerGas)}`);
        
        return {
            maxFeePerGas,
            maxPriorityFeePerGas: priorityFee
        };
    } catch (error) {
        logger.warning(`Failed to get dynamic gas price: ${error.message}`);
        // Fallback to much lower static gas price
        const staticGasPrice = ethers.utils.parseUnits('0.01', 'gwei');
        logger.info(`Using fallback gas price: ${formatHelper.formatGwei(staticGasPrice)}`);
        return {
            maxFeePerGas: staticGasPrice,
            maxPriorityFeePerGas: staticGasPrice
        };
    }
}

async function estimateGasWithFallback(wallet, txRequest) {
    try {
        const gasEstimate = await wallet.provider.estimateGas(txRequest);
        // Add 20% buffer to estimated gas
        const gasWithBuffer = gasEstimate.mul(120).div(100);
        logger.info(`Gas estimation successful: ${gasEstimate.toString()} (with 20% buffer: ${gasWithBuffer.toString()})`);
        return gasWithBuffer;
    } catch (error) {
        // Extract only the main error message without the details
        const errorMessage = error.message.split(';')[0];
        logger.warning(`${errorMessage}`);
        // Fallback to default gas limit
        const defaultGas = ethers.BigNumber.from('350000');
        logger.info(`Using fallback gas limit: ${defaultGas.toString()}`);
        return defaultGas;
    }
}

// Check balance function with gas price parameters
async function checkBalance(wallet, amount, gasEstimate, gasPrice) {
    const balance = await wallet.getBalance();
    const totalCost = amount.add(gasEstimate.mul(gasPrice));
    
    logger.info(`Balance Check:
    Current Balance: ${formatHelper.formatEthValue(balance)}
    Transaction Amount: ${formatHelper.formatEthValue(amount)}
    Estimated Gas Cost: ${formatHelper.formatEthValue(gasEstimate.mul(gasPrice))}
    Total Cost: ${formatHelper.formatEthValue(totalCost)}`);
    
    return balance.gte(totalCost);
}

// Main swap function with dynamic gas
async function createSwap(wallet, amount, recipient) {
    const params = [
        config.TOKEN_IN,
        config.TOKEN_OUT,
        config.POOL_FEE,
        recipient,
        Math.floor(Date.now() / 1000) + 3600,
        amount,
        53081,
        0
    ];

    const iface = new ethers.utils.Interface([
        'function exactInputSingle((address,address,address,address,uint256,uint256,uint256,uint160)) external payable returns (uint256)'
    ]);

    const data = iface.encodeFunctionData('exactInputSingle', [params]);

    const txRequest = {
        chainId: config.CHAIN_ID,
        to: config.QUICKSWAP_ROUTER,
        value: amount,
        data: data,
        type: 2
    };

    // Get dynamic gas price
    const { maxFeePerGas, maxPriorityFeePerGas } = await getDynamicGasPrice(wallet.provider);

    // Estimate gas with fallback
    const gasLimit = await estimateGasWithFallback(wallet, txRequest);

    // Check if we have enough balance
    const hasEnoughBalance = await checkBalance(wallet, amount, gasLimit, maxFeePerGas);
    if (!hasEnoughBalance) {
        throw new Error('Insufficient balance for transaction');
    }

    return {
        ...txRequest,
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas
    };
}

// Sequential swap function with dynamic gas
async function createSequentialSwap(wallet, amount, recipient) {
    logger.info('Starting Sequential Swap Process with Dynamic Gas');
    logger.info('Checking initial balances...');
    await checkBalances(wallet);

    const { maxFeePerGas, maxPriorityFeePerGas } = await getDynamicGasPrice(wallet.provider);

    const swapParams1 = [
        config.TOKEN_IN,
        config.TOKEN_OUT,
        config.POOL_FEE,
        recipient,
        Math.floor(Date.now() / 1000) + 3600,
        amount,
        53081,
        0
    ];

    const iface = new ethers.utils.Interface([
        'function exactInputSingle((address,address,address,address,uint256,uint256,uint256,uint160)) external payable returns (uint256)',
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function withdraw(uint256 wad) external'
    ]);

    let currentNonce = await wallet.getTransactionCount();

    // Base transaction parameters
    const baseTxParams = {
        chainId: config.CHAIN_ID,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas
    };

    // Step 1: ETH to USDC with dynamic gas
    const swapData1 = iface.encodeFunctionData('exactInputSingle', [swapParams1]);
    const tx1Request = {
        ...baseTxParams,
        to: config.QUICKSWAP_ROUTER,
        value: amount,
        data: swapData1,
        nonce: currentNonce++
    };

    tx1Request.gasLimit = await estimateGasWithFallback(wallet, tx1Request);

    logger.info(`Step 1: Initiating ETH → USDC swap (${formatHelper.formatEthValue(amount)})`);
    const swap1 = await wallet.sendTransaction(tx1Request);
    await swap1.wait();
    logger.success(`ETH → USDC swap complete. Hash: ${swap1.hash}`);

    // Wait and check balances
    await new Promise(resolve => setTimeout(resolve, 2000));
    logger.info('Checking balances after ETH → USDC swap...');
    await checkBalances(wallet);

    // Step 2: Approve USDC with dynamic gas
    const approveData = iface.encodeFunctionData('approve', [config.QUICKSWAP_ROUTER, ethers.constants.MaxUint256]);
    const approveTxRequest = {
        ...baseTxParams,
        to: config.TOKEN_OUT,
        value: 0,
        data: approveData,
        nonce: currentNonce++
    };

    approveTxRequest.gasLimit = await estimateGasWithFallback(wallet, approveTxRequest);

    logger.info('Step 2: Approving USDC for QuickSwap Router...');
    const approve = await wallet.sendTransaction(approveTxRequest);
    await approve.wait();
    logger.success(`USDC approval complete. Hash: ${approve.hash}`);

    // Wait and check USDC balance
    await new Promise(resolve => setTimeout(resolve, 2000));
    const { usdcBalance } = await checkBalances(wallet);

    // Step 3: USDC to WETH with dynamic gas
    const swapParams2 = [
        config.TOKEN_OUT,
        config.TOKEN_IN,
        config.POOL_FEE,
        recipient,
        Math.floor(Date.now() / 1000) + 3600,
        usdcBalance,
        53081,
        0
    ];

    const swapData2 = iface.encodeFunctionData('exactInputSingle', [swapParams2]);
    const tx2Request = {
        ...baseTxParams,
        to: config.QUICKSWAP_ROUTER,
        value: 0,
        data: swapData2,
        nonce: currentNonce++
    };

    tx2Request.gasLimit = await estimateGasWithFallback(wallet, tx2Request);

    logger.info(`Step 3: Initiating USDC → WETH swap (${formatHelper.formatUsdcValue(usdcBalance)})`);
    const swap2 = await wallet.sendTransaction(tx2Request);
    await swap2.wait();
    logger.success(`USDC → WETH swap complete. Hash: ${swap2.hash}`);

    // Wait and check balances
    await new Promise(resolve => setTimeout(resolve, 2000));
    logger.info('Checking balances after USDC → WETH swap...');
    const wethBalance = await getWETHBalance(wallet);
    logger.info(`WETH Balance: ${formatHelper.formatEthValue(wethBalance)}`);

    // Step 4: Approve WETH with dynamic gas
    const approveWethData = iface.encodeFunctionData('approve', [config.QUICKSWAP_ROUTER, ethers.constants.MaxUint256]);
    const approveWethTxRequest = {
        ...baseTxParams,
        to: config.TOKEN_IN,
        value: 0,
        data: approveWethData,
        nonce: currentNonce++
    };

    approveWethTxRequest.gasLimit = await estimateGasWithFallback(wallet, approveWethTxRequest);

    logger.info('Step 4: Approving WETH...');
    const approveWeth = await wallet.sendTransaction(approveWethTxRequest);
    await approveWeth.wait();
    logger.success(`WETH approval complete. Hash: ${approveWeth.hash}`);

    // Wait before withdrawal
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 5: WETH to ETH (Withdraw) with dynamic gas
    const withdrawData = iface.encodeFunctionData('withdraw', [wethBalance]);
    const withdrawTxRequest = {
        ...baseTxParams,
        to: config.TOKEN_IN,
        value: 0,
        data: withdrawData,
        nonce: currentNonce++
    };

    withdrawTxRequest.gasLimit = await estimateGasWithFallback(wallet, withdrawTxRequest);

    logger.info(`Step 5: Withdrawing WETH to ETH (${formatHelper.formatEthValue(wethBalance)})`);
    const withdraw = await wallet.sendTransaction(withdrawTxRequest);
    await withdraw.wait();
    logger.success(`WETH → ETH withdrawal complete. Hash: ${withdraw.hash}`);

    // Final balance check
    await new Promise(resolve => setTimeout(resolve, 2000));
    logger.info('Final balances:');
    await checkBalances(wallet);

    return tx1Request;
}

// Helper function to get WETH balance
async function getWETHBalance(wallet) {
    const wethInterface = new ethers.utils.Interface([
        'function balanceOf(address owner) view returns (uint256)'
    ]);
    const wethContract = new ethers.Contract(config.TOKEN_IN, wethInterface, wallet);
    return await wethContract.balanceOf(wallet.address);
}

// Balance checking function
async function checkBalances(wallet) {
    const ethBalance = await wallet.getBalance();
    const usdcInterface = new ethers.utils.Interface([
        'function balanceOf(address owner) view returns (uint256)'
    ]);
    const usdcContract = new ethers.Contract(config.TOKEN_OUT, usdcInterface, wallet);
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    const wethBalance = await getWETHBalance(wallet);

    console.log(chalk.gray(timeHelper.getTimestamp()), chalk.cyan('Current Balances:'));
    console.log(chalk.gray(timeHelper.getTimestamp()), chalk.cyan('├─ ETH:  '), chalk.yellow(formatHelper.formatEthValue(ethBalance)));
    console.log(chalk.gray(timeHelper.getTimestamp()), chalk.cyan('├─ WETH: '), chalk.yellow(formatHelper.formatEthValue(wethBalance)));
    console.log(chalk.gray(timeHelper.getTimestamp()), chalk.cyan('└─ USDC: '), chalk.yellow(formatHelper.formatUsdcValue(usdcBalance)));
    
    return { ethBalance, usdcBalance, wethBalance };
}

async function processWallet(privateKey, walletIndex, userConfig) {
    const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    logger.walletHeader(wallet.address, walletIndex);
    logger.info(`Starting swaps for wallet ${walletIndex + 1}`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < userConfig.numberOfSwaps; i++) {
        logger.divider();
        logger.info(`Starting Swap ${i + 1}/${userConfig.numberOfSwaps}`);
        
        try {
            const amountInWei = ethers.utils.parseEther(userConfig.amountPerSwap || config.DEFAULT_AMOUNT);
            
            if (userConfig.sequentialSwap) {
                // For sequential swap
                await createSequentialSwap(wallet, amountInWei, wallet.address);
                logger.success(`Sequential Swap ${i + 1} completed successfully`);
                successCount++;
            } else {
                // For single swap
                const tx = await createSwap(wallet, amountInWei, wallet.address);
                tx.nonce = await wallet.getTransactionCount();

                logger.info('Transaction details:', {
                    gasLimit: tx.gasLimit.toString(),
                    maxFeePerGas: formatHelper.formatGwei(tx.maxFeePerGas),
                    maxPriorityFeePerGas: formatHelper.formatGwei(tx.maxPriorityFeePerGas),
                    value: formatHelper.formatEthValue(tx.value)
                });
                
                const signedTx = await wallet.sendTransaction(tx);
                logger.info(`Transaction sent: ${signedTx.hash}`);
                
                const receipt = await signedTx.wait();
                if (receipt.status === 1) {
                    logger.success(`Swap ${i + 1} confirmed successfully`);
                    successCount++;
                } else {
                    logger.error(`Swap ${i + 1} failed`);
                    failCount++;
                }
            }
            
            const delay = Math.floor(Math.random() * 10000) + 5000;
            logger.info(`Waiting ${Math.floor(delay/1000)} seconds before next transaction...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
        } catch (error) {
            logger.error(`Error in swap ${i + 1}: ${error.message}`);
            failCount++;
        }
    }
    
    return { successCount, failCount };
}

async function main() {
    try {
        const userConfig = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
        const privateKeys = fs.readFileSync('./pk.txt', 'utf8')
            .split('\n')
            .map(key => key.trim())
            .filter(key => key.length > 0);

        logger.info(`Loaded ${privateKeys.length} wallets`);
        logger.info(`Configured for ${userConfig.numberOfSwaps} swaps per wallet`);
        logger.divider();

        const results = [];
        
        for (let i = 0; i < privateKeys.length; i++) {
            const result = await processWallet(privateKeys[i], i, userConfig);
            results.push(result);
        }

        // Print summary
        logger.divider();
        logger.info('EXECUTION SUMMARY');
        logger.divider();
        
        results.forEach((result, index) => {
            logger.info(`Wallet #${index + 1}:`);
            logger.success(`Successful Swaps: ${result.successCount}`);
            logger.error(`Failed Swaps: ${result.failCount}`);
            logger.divider();
        });

        const totalSuccess = results.reduce((sum, result) => sum + result.successCount, 0);
        const totalFail = results.reduce((sum, result) => sum + result.failCount, 0);
        
        logger.info('TOTAL RESULTS');
        logger.success(`Total Successful Swaps: ${totalSuccess}`);
        logger.error(`Total Failed Swaps: ${totalFail}`);
        logger.info(`Success Rate: ${((totalSuccess / (totalSuccess + totalFail)) * 100).toFixed(2)}%`);
        
    } catch (error) {
        logger.error(`Fatal error: ${error.message}`);
        process.exit(1);
    }
}

main().catch(error => {
    logger.error(`Unhandled error: ${error.message}`);
    process.exit(1);
});
