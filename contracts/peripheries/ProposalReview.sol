// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../libraries/Ad.sol";
import "../libraries/Purchase.sol";
import "../accessors/NameAccessor.sol";
import "../common/BlockTimestamp.sol";
import "../interfaces/IProposalReview.sol";
import "../interfaces/IEventEmitter.sol";
import "../interfaces/IEnglishAuction.sol";
import "../interfaces/IMediaRegistry.sol";

contract ProposalReview is IProposalReview, BlockTimestamp, NameAccessor {
	/// @dev Maps a tokenId with the proposal content.
	mapping(uint256 => Proposal) public proposed;

	/// @dev Maps a tokenId with denied reasons.
	mapping(uint256 => Denied[]) public deniedReasons;

	/// @dev Maps a tokenId with the content metadata.
	mapping(uint256 => string) public accepted;

	modifier onlyProxies() {
		require(_mediaRegistry().ownerOf(msg.sender) != address(0x0), "KD011");
		_;
	}

	modifier onlyOpenBid() {
		require(msg.sender == openBidAddress(), "KD011");
		_;
	}

	constructor(address _nameRegistry) {
		initialize(_nameRegistry);
	}

	/// @inheritdoc IProposalReview
	function propose(
		uint256 tokenId,
		string memory metadata,
		address msgSender
	) external virtual onlyProxies {
		require(bytes(accepted[tokenId]).length == 0, "KD132");
		proposed[tokenId] = Proposal(metadata, msgSender);
		_event().emitPropose(tokenId, metadata);
	}

	/// @inheritdoc IProposalReview
	function accept(uint256 tokenId) external virtual onlyProxies {
		string memory metadata = proposed[tokenId].content;
		require(bytes(metadata).length != 0, "KD130");
		accepted[tokenId] = metadata;
		proposed[tokenId] = Proposal("", proposed[tokenId].proposer);
		_event().emitAcceptProposal(tokenId, metadata);
	}

	/// @inheritdoc IProposalReview
	function denyProposal(
		uint256 tokenId,
		string memory reason,
		bool offensive
	) external virtual onlyProxies {
		string memory metadata = proposed[tokenId].content;
		require(bytes(metadata).length != 0, "KD130");
		deniedReasons[tokenId].push(Denied(reason, offensive));
		_event().emitDenyProposal(tokenId, metadata, reason, offensive);
	}

	/// @inheritdoc IProposalReview
	function acceptToOpenBid(uint256 tokenId, string memory metadata)
		external
		virtual
		onlyOpenBid
	{
		accepted[tokenId] = metadata;
		_event().emitAcceptProposal(tokenId, metadata);
	}

	/// @inheritdoc IProposalReview
	function proposer(uint256 tokenId) external view returns (address) {
		return proposed[tokenId].proposer;
	}

	/// @inheritdoc IProposalReview
	function acceptedContent(uint256 tokenId)
		external
		view
		returns (string memory)
	{
		return accepted[tokenId];
	}

	function _event() internal view virtual returns (IEventEmitter) {
		return IEventEmitter(eventEmitterAddress());
	}

	function _mediaRegistry() internal view returns (IMediaRegistry) {
		return IMediaRegistry(mediaRegistryAddress());
	}
}
