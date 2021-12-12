// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../libraries/Ad.sol";
import "../libraries/Purchase.sol";
import "../accessors/NameAccessor.sol";
import "../common/BlockTimestamp.sol";
import "../interfaces/IAdPool.sol";
import "../interfaces/IEventEmitter.sol";
import "../interfaces/IOpenBid.sol";
import "../interfaces/IMediaRegistry.sol";
import "../interfaces/IProposalReview.sol";

contract OpenBid is IOpenBid, BlockTimestamp, NameAccessor {
	/// @dev Maps a tokenId with appeal info
	mapping(uint256 => Sale.OpenBid[]) internal _bidding;

	/// @dev Maps a tokenId with the reason why the content is selected
	mapping(uint256 => string) public reasons;

	modifier onlyProxies() {
		require(_mediaRegistry().ownerOf(msg.sender) != address(0x0), "KD011");
		_;
	}

	modifier onlyAdPool() {
		require(msg.sender == adPoolAddress(), "KD011");
		_;
	}

	constructor(address _nameRegistry) {
		initialize(_nameRegistry);
	}

	/// @inheritdoc IOpenBid
	function bid(
		uint256 tokenId,
		string memory proposal,
		address sender,
		uint256 value
	) external virtual onlyAdPool {
		_bidding[tokenId].push(Sale.OpenBid(tokenId, sender, value, proposal));
		_event().emitBidWithProposal(
			tokenId,
			value,
			sender,
			proposal,
			_blockTimestamp()
		);
	}

	/// @inheritdoc IOpenBid
	function selectProposal(
		uint256 tokenId,
		uint256 index,
		string memory reason
	)
		external
		virtual
		onlyProxies
		returns (Sale.OpenBid memory selected, Sale.OpenBid[] memory nonSelected)
	{
		require(
			_adPool().allPeriods(tokenId).saleEndTimestamp < _blockTimestamp(),
			"KD129"
		);
		selected = bidding(tokenId, index);
		_review().acceptToOpenBid(tokenId, selected.content);
		reasons[tokenId] = reason;
		delete _bidding[tokenId][index];
		nonSelected = _bidding[tokenId];
		delete _bidding[tokenId];
		_event().emitSelectProposal(tokenId, index, selected.sender, reason);
	}

	function biddingList(uint256 tokenId)
		public
		view
		returns (Sale.OpenBid[] memory)
	{
		return _bidding[tokenId];
	}

	function bidding(uint256 tokenId, uint256 index)
		public
		view
		returns (Sale.OpenBid memory)
	{
		require(
			_bidding[tokenId].length >= index &&
				_bidding[tokenId][index].sender != address(0),
			"KD114"
		);
		return _bidding[tokenId][index];
	}

	/**
	 * Accessors
	 */
	function _adPool() internal view returns (IAdPool) {
		return IAdPool(adPoolAddress());
	}

	function _review() internal view virtual returns (IProposalReview) {
		return IProposalReview(proposalReviewAddress());
	}

	function _event() internal view virtual returns (IEventEmitter) {
		return IEventEmitter(eventEmitterAddress());
	}

	function _mediaRegistry() internal view returns (IMediaRegistry) {
		return IMediaRegistry(mediaRegistryAddress());
	}
}
