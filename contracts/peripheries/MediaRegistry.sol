// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "../accessors/NameAccessor.sol";
import "../common/BlockTimestamp.sol";
import "hardhat/console.sol";

/// @title MediaRegistry - registers a list of media accounts.
/// @author Shumpei Koike - <shumpei.koike@bridges.inc>
contract MediaRegistry is BlockTimestamp, NameAccessor {
	struct Account {
		address proxy;
		address mediaEOA;
		string metadata;
	}
	mapping(address => Account) public allAccounts;

	modifier onlyProxies() {
		require(ownerOf(msg.sender) != address(0), "KD011");
		_;
	}

	/// Constructor
	/// @dev _nameRegistry address of the NameRegistry
	constructor(address _nameRegistry) {
		initialize(_nameRegistry);
	}

	/// @dev Adds media account.
	/// @param proxy address of the proxy contract
	/// @param metadata string of the account metadata
	/// @param mediaEOA address of the media account
	function addMedia(
		address proxy,
		string memory metadata,
		address mediaEOA
	) external onlyFactory {
		allAccounts[proxy] = Account(proxy, mediaEOA, metadata);
	}

	/// @dev Updates media account.
	/// @param metadata string of the account metadata
	/// @param mediaEOA address of the media account
	function updateMedia(address mediaEOA, string memory metadata)
		external
		onlyProxies
	{
		allAccounts[msg.sender] = Account(msg.sender, mediaEOA, metadata);
	}

	/// @dev Returns whether the account has created or not.
	/// @param proxy address of the proxy contract that represents an account.
	function created(address proxy) public view returns (bool) {
		return allAccounts[proxy].proxy != address(0x0);
	}

	/// @dev Returns the owner of the account.
	/// @param proxy address of the proxy contract that represents an account.
	function ownerOf(address proxy) public view returns (address) {
		return allAccounts[proxy].mediaEOA;
	}
}