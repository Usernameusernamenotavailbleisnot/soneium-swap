# Soneium Auto Swap Bot

An automated trading bot for executing ETH → USDC → WETH → ETH swaps on Soneium network using QuickSwap DEX.

## Features

- Support for multiple wallet operations
- Configurable swap amounts and frequencies
- Sequential swap mode (ETH → USDC → WETH → ETH)
- Regular swap mode (single direction)
- Built-in balance checking and gas estimation
- Detailed logging with timestamps
- Transaction status monitoring
- Random delay between transactions for natural behavior

## Prerequisites

- Node.js (v12 or higher)
- npm or yarn package manager
- Active wallets with Soneium network ETH

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Usernameusernamenotavailbleisnot/soneium-swap
cd soneium-swap
```

2. Install dependencies:
```bash
npm install
```

## Configuration

### 1. Create config.json
Create a `config.json` file in the root directory with the following structure:

```json
{
  "numberOfSwaps": 5,
  "amountPerSwap": "0.00002",
  "sequentialSwap": true
}
```

Parameters:
- `numberOfSwaps`: Number of swaps to perform per wallet
- `amountPerSwap`: Amount of ETH per swap (in ETH units)
- `sequentialSwap`: Set to true for ETH → USDC → WETH → ETH swaps, false for single direction swaps

### 2. Set up Private Keys
Create a `pk.txt` file in the root directory with one private key per line:
```
private_key_1
private_key_2
private_key_3
```

### 3. Network Configuration
Default configuration uses:
- RPC URL: https://rpc.soneium.org/
- Chain ID: 1868
- QuickSwap Router: 0xeba58c20629ddab41e21a3e4e2422e583ebd9719
- ETH Token: 0x4200000000000000000000000000000000000006
- USDC Token: 0xbA9986D2381edf1DA03B0B9c1f8b00dc4AacC369

## Usage

Run the bot:
```bash
node index.js
```

The bot will:
1. Load configurations and private keys
2. Process each wallet sequentially
3. Execute configured number of swaps
4. Display detailed logs and final summary

## Logging Features

The bot provides detailed logging with:
- Timestamp for each operation
- Color-coded log levels (INFO, SUCCESS, ERROR, WARNING)
- Transaction hash tracking
- Balance updates
- Success/failure statistics

## Safety Features

- Balance checking before transactions
- Gas estimation
- Transaction confirmation monitoring
- Error handling with detailed messages
- Random delays between transactions (5-15 seconds)

## Transaction Monitoring

Each swap transaction includes:
- Gas limit validation
- Gas price optimization
- Transaction hash tracking
- Confirmation status
- Balance updates before and after swaps

## Error Handling

The bot includes comprehensive error handling for:
- Insufficient balance
- Failed transactions
- Network issues
- Invalid configurations
- RPC errors

## Warnings and Disclaimers

- Always test with small amounts first
- Keep private keys secure and never share them
- Monitor network fees and token prices
- Ensure sufficient ETH for gas fees
- This bot is for educational purposes only

## Support

For issues and feature requests, please create an issue in the repository.

## License

MIT License - See LICENSE file for details
