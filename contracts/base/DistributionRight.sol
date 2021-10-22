// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "./ERC721.sol";
import "../accessors/NameAccessor.sol";

import "hardhat/console.sol";

/// @title AdManager - allows anyone to create a post and bit to the post.
/// @author Shumpei Koike - <shumpei.koike@bridges.inc>
contract DistributionRight is ERC721, NameAccessor {
	mapping(uint256 => string) public proposed;
	mapping(uint256 => string) public deniedReason;

	function _mintRight(uint256 tokenId, string memory metadata) internal {
		_mint(address(this), tokenId);
		_tokenURIs[tokenId] = metadata;
	}

	function _burnRight(uint256 tokenId) internal {
		_burn(tokenId);
		_tokenURIs[tokenId] = "";
	}

	function _soldRight(uint256 tokenId) internal {
		_transfer(address(this), msg.sender, tokenId);
	}

	function _proposeToRight(uint256 tokenId, string memory metadata) internal {
		proposed[tokenId] = metadata;
	}
}
