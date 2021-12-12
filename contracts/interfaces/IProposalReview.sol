// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

/// @title IProposalReview
/// @author Shumpei Koike - <shumpei.koike@bridges.inc>
interface IProposalReview {
	struct Denied {
		string reason;
		bool offensive;
	}
	struct Proposal {
		string content;
		address proposer;
	}

	/// @dev Proposes the metadata to the token you bought.
	///      Users can propose many times as long as it is accepted.
	/// @param tokenId uint256 of the token ID
	/// @param metadata string of the proposal metadata
	/// @param msgSender address of the msg.sender
	function propose(
		uint256 tokenId,
		string memory metadata,
		address msgSender
	) external;

	/// @dev Accepts the proposal.
	/// @param tokenId uint256 of the token ID
	function accept(uint256 tokenId) external;

	/// @dev Denies the submitted proposal, mentioning what is the problem.
	/// @param tokenId uint256 of the token ID
	/// @param reason string of the reason why it is rejected
	/// @param offensive bool if the content would offend somebody
	function denyProposal(
		uint256 tokenId,
		string memory reason,
		bool offensive
	) external;

	/// @dev Returns the proposer of the token.
	/// @param tokenId uint256 of the token ID
	function proposer(uint256 tokenId) external view returns (address);

	/// @dev Returns the proposal content of the token.
	/// @param tokenId uint256 of the token ID
	function acceptedContent(uint256 tokenId)
		external
		view
		returns (string memory);

	/// @dev Accepts the best proposal for an open bidding.
	/// @param tokenId uint256 of the token ID
	/// @param metadata string of the proposal metadata
	function acceptToOpenBid(uint256 tokenId, string memory metadata) external;
}
