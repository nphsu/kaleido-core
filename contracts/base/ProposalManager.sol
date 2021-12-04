// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "./SpaceManager.sol";

/// @title ProposalManager - manages proposals.
/// @author Shumpei Koike - <shumpei.koike@bridges.inc>
abstract contract ProposalManager is SpaceManager {
	function _proposeToRight(uint256 tokenId, string memory metadata)
		internal
		virtual
	{
		proposed[tokenId] = Draft.Proposal(metadata, msg.sender);
	}

	function _clearProposal(uint256 tokenId) internal virtual {
		proposed[tokenId] = Draft.Proposal("", proposed[tokenId].proposer);
	}

	function _acceptProposal(uint256 tokenId, string memory metadata)
		internal
		virtual
	{
		accepted[tokenId] = metadata;
		_clearProposal(tokenId);
	}
}
