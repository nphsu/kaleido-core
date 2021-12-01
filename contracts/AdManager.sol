// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./base/PrimarySales.sol";
import "./base/ProposalManager.sol";
import "./base/DistributionRight.sol";
import "./common/EtherPaymentFallback.sol";
import "hardhat/console.sol";

/// @title AdManager - manages ad spaces and its periods to sell them to users.
/// @author Shumpei Koike - <shumpei.koike@bridges.inc>
contract AdManager is
	DistributionRight,
	PrimarySales,
	ProposalManager,
	EtherPaymentFallback,
	ReentrancyGuard
{
	/// @dev Can call it by only the media
	modifier onlyMedia() {
		require(_mediaRegistry().ownerOf(address(this)) == msg.sender, "KD012");
		_;
	}

	/// @dev Prevents the media from calling by yourself
	modifier exceptYourself() {
		require(_mediaRegistry().ownerOf(address(this)) != msg.sender, "KD014");
		_;
	}

	/// @dev Called by the successful bidder
	modifier onlySuccessfulBidder(uint256 tokenId) {
		require(bidding[tokenId].bidder == msg.sender, "KD126");
		_;
	}

	/// @dev Can call it only once
	modifier initializer() {
		require(address(_nameRegistry) == address(0x0), "AR000");
		_;
	}

	/// @dev Initialize the instance.
	/// @param title string of the title of the instance
	/// @param baseURI string of the base URI
	/// @param nameRegistry address of NameRegistry
	function initialize(
		string memory title,
		string memory baseURI,
		address nameRegistry
	) external {
		_name = title;
		_symbol = string(abi.encodePacked("Kaleido_", title));
		_baseURI = baseURI;
		initialize(nameRegistry);
	}

	/// @dev Updates the media EOA and the metadata.
	/// @param newMediaEOA address of a new EOA
	/// @param newMetadata string of a new metadata
	function updateMedia(address newMediaEOA, string memory newMetadata)
		external
		onlyMedia
	{
		_mediaRegistry().updateMedia(newMediaEOA, newMetadata);
		_eventEmitter().emitUpdateMedia(address(this), newMediaEOA, newMetadata);
	}

	// TODO: can withdraw by bidder to failure txs

	/// @dev Creates a new space for the media account.
	/// @param spaceMetadata string of the space metadata
	function newSpace(string memory spaceMetadata) external onlyMedia {
		_newSpace(spaceMetadata);
	}

	/// @dev Create a new period for a space. This function requires some params
	///      to decide which kinds of pricing way and how much price to get started.
	/// @param spaceMetadata string of the space metadata
	/// @param tokenMetadata string of the token metadata
	/// @param saleEndTimestamp uint256 of the end timestamp for the sale
	/// @param displayStartTimestamp uint256 of the start timestamp for the display
	/// @param displayEndTimestamp uint256 of the end timestamp for the display
	/// @param pricing uint256 of the pricing way
	/// @param minPrice uint256 of the minimum price to sell it out
	function newPeriod(
		string memory spaceMetadata,
		string memory tokenMetadata,
		uint256 saleEndTimestamp,
		uint256 displayStartTimestamp,
		uint256 displayEndTimestamp,
		Ad.Pricing pricing,
		uint256 minPrice
	) external onlyMedia {
		require(saleEndTimestamp > _blockTimestamp(), "KD111");
		require(saleEndTimestamp < displayStartTimestamp, "KD112");
		require(displayStartTimestamp < displayEndTimestamp, "KD113");

		if (!spaced[spaceMetadata]) {
			_newSpace(spaceMetadata);
		}
		_checkOverlapping(
			spaceMetadata,
			displayStartTimestamp,
			displayEndTimestamp
		);
		uint256 tokenId = Ad.id(
			spaceMetadata,
			displayStartTimestamp,
			displayEndTimestamp
		);
		Ad.Period memory period = Ad.Period(
			address(this),
			spaceMetadata,
			tokenMetadata,
			_blockTimestamp(),
			saleEndTimestamp,
			displayStartTimestamp,
			displayEndTimestamp,
			pricing,
			minPrice,
			0,
			false
		);
		period.startPrice = Sale._startPrice(period);
		_savePeriod(spaceMetadata, tokenId, period);
		_mintRight(address(this), tokenId, tokenMetadata);
		_eventEmitter().emitNewPeriod(
			tokenId,
			spaceMetadata,
			tokenMetadata,
			_blockTimestamp(),
			saleEndTimestamp,
			displayStartTimestamp,
			displayEndTimestamp,
			pricing,
			minPrice
		);
		_eventEmitter().emitTransferCustom(address(0), address(this), tokenId);
	}

	/// @dev Deletes a period and its token.
	///      If there is any users locking the fund for the sale, the amount would be transfered
	///      to the user when deleting the period.
	/// @param tokenId uint256 of the token ID
	function deletePeriod(uint256 tokenId) external onlyMedia {
		require(periods[tokenId].mediaProxy != address(0), "KD114");
		require(ownerOf(tokenId) == address(this), "KD121");
		require(!_alreadyBid(tokenId), "KD128");
		_burnRight(tokenId);
		_deletePeriod(tokenId, periods[tokenId]);
		_eventEmitter().emitDeletePeriod(tokenId);
		_eventEmitter().emitTransferCustom(address(this), address(0), tokenId);
	}

	/// @dev Buys the token that is defined as the specific period on an ad space.
	///      The price of the token is fixed.
	/// @param tokenId uint256 of the token ID
	function buy(uint256 tokenId) external payable exceptYourself {
		_checkBeforeBuy(tokenId);
		periods[tokenId].sold = true;
		_dropRight(msg.sender, tokenId);
		_collectFees(msg.value / 10);
		_eventEmitter().emitBuy(tokenId, msg.value, msg.sender, _blockTimestamp());
		_eventEmitter().emitTransferCustom(address(this), msg.sender, tokenId);
	}

	/// @dev Buys the token that is defined as the specific period on an ad space.
	///      The price is decreasing as time goes by.
	/// @param tokenId uint256 of the token ID
	function buyBasedOnTime(uint256 tokenId) external payable exceptYourself {
		_checkBeforeBuyBasedOnTime(tokenId);
		periods[tokenId].sold = true;
		_dropRight(msg.sender, tokenId);
		_collectFees(msg.value / 10);
		_eventEmitter().emitBuy(tokenId, msg.value, msg.sender, _blockTimestamp());
		_eventEmitter().emitTransferCustom(address(this), msg.sender, tokenId);
	}

	/// @dev Bids to participate in an auction.
	/// @param tokenId uint256 of the token ID
	function bid(uint256 tokenId) external payable exceptYourself nonReentrant {
		_checkBeforeBid(tokenId);
		_refundBiddingAmount(tokenId);
		_biddingTotal += (msg.value - bidding[tokenId].price);
		bidding[tokenId] = Sale.Bidding(tokenId, msg.sender, msg.value);
		_eventEmitter().emitBid(tokenId, msg.value, msg.sender, _blockTimestamp());
	}

	function bidWithProposal(uint256 tokenId, string memory proposalMetadata)
		external
		payable
		exceptYourself
		nonReentrant
	{
		_checkBeforeBidWithProposal(tokenId);
		_biddingTotal += msg.value;
		appealed[tokenId].push(
			Sale.Appeal(tokenId, msg.sender, msg.value, proposalMetadata)
		);
		_eventEmitter().emitBidWithProposal(
			tokenId,
			msg.value,
			msg.sender,
			proposalMetadata,
			_blockTimestamp()
		);
	}

	/// @dev Selects the best proposal bidded with.
	/// @param tokenId uint256 of the token ID
	/// @param index uint256 of the index number
	function selectProposal(uint256 tokenId, uint256 index) external onlyMedia {
		Sale.Appeal memory appeal = appealed[tokenId][index];
		require(appeal.sender != address(0), "KD114");
		require(periods[tokenId].saleEndTimestamp < _blockTimestamp(), "KD129");

		_dropRight(appeal.sender, tokenId);
		_collectFees(appeal.price / 10);
		// TODO: distribute return payments
		delete appealed[tokenId];
		_eventEmitter().emitSelectProposal(tokenId, appeal.sender);
		_eventEmitter().emitTransferCustom(address(this), appeal.sender, tokenId);
	}

	/// @dev Receives the token you bidded if you are the successful bidder.
	/// @param tokenId uint256 of the token ID
	function receiveToken(uint256 tokenId)
		external
		payable
		onlySuccessfulBidder(tokenId)
	{
		_checkBeforeReceiveToken(tokenId);
		uint256 price = bidding[tokenId].price;
		periods[tokenId].sold = true;
		_biddingTotal -= price;
		_dropRight(msg.sender, tokenId);
		_collectFees(price / 10);
		delete bidding[tokenId];
		_eventEmitter().emitReceiveToken(
			tokenId,
			price,
			msg.sender,
			_blockTimestamp()
		);
		_eventEmitter().emitTransferCustom(address(this), msg.sender, tokenId);
	}

	// TODO: enable media to push token

	/// @dev Offers to buy a period that the sender requests.
	/// @param spaceMetadata string of the space metadata
	/// @param displayStartTimestamp uint256 of the start timestamp for the display
	/// @param displayEndTimestamp uint256 of the end timestamp for the display
	function offerPeriod(
		string memory spaceMetadata,
		uint256 displayStartTimestamp,
		uint256 displayEndTimestamp
	) external payable exceptYourself {
		require(spaced[spaceMetadata], "KD101");
		require(displayStartTimestamp < displayEndTimestamp, "KD113");
		uint256 tokenId = Ad.id(
			spaceMetadata,
			displayStartTimestamp,
			displayEndTimestamp
		);
		offered[tokenId] = Sale.Offer(
			spaceMetadata,
			displayStartTimestamp,
			displayEndTimestamp,
			msg.sender,
			msg.value
		);
		_offeredTotal += msg.value;
		_eventEmitter().emitOfferPeriod(
			tokenId,
			spaceMetadata,
			displayStartTimestamp,
			displayEndTimestamp,
			msg.sender,
			msg.value
		);
	}

	/// @dev Cancels an offer.
	/// @param tokenId uint256 of the token ID
	function cancelOffer(uint256 tokenId) external payable exceptYourself {
		require(offered[tokenId].sender == msg.sender, "KD116");
		_refundOfferedAmount(tokenId);
		_offeredTotal -= offered[tokenId].price;
		delete offered[tokenId];
		_eventEmitter().emitCancelOffer(tokenId);
	}

	/// @dev Accepts an offer by the Media.
	/// @param tokenId uint256 of the token ID
	/// @param tokenMetadata string of the NFT token metadata
	function acceptOffer(uint256 tokenId, string memory tokenMetadata)
		external
		onlyMedia
	{
		Sale.Offer memory offer = offered[tokenId];
		require(offer.sender != address(0), "KD115");
		_checkOverlapping(
			offer.spaceMetadata,
			offer.displayStartTimestamp,
			offer.displayEndTimestamp
		);
		Ad.Period memory period = Ad.Period(
			offer.sender,
			offer.spaceMetadata,
			tokenMetadata,
			_blockTimestamp(),
			_blockTimestamp(),
			offer.displayStartTimestamp,
			offer.displayEndTimestamp,
			Ad.Pricing.OFFER,
			offer.price,
			offer.price,
			true
		);

		_mintRight(offer.sender, tokenId, tokenMetadata);
		_savePeriod(offer.spaceMetadata, tokenId, period);
		_collectFees(offer.price / 10);

		_offeredTotal -= offer.price;
		delete offered[tokenId];

		_eventEmitter().emitAcceptOffer(
			tokenId,
			offer.spaceMetadata,
			tokenMetadata,
			offer.displayStartTimestamp,
			offer.displayEndTimestamp,
			offer.price
		);
		_eventEmitter().emitTransferCustom(address(0), address(this), tokenId);
	}

	/// @dev Withdraws the fund deposited to the proxy contract.
	///      If you put 0 as the amount, you can withdraw as much as possible.
	function withdraw() external onlyMedia {
		uint256 withdrawal = withdrawalAmount();
		payable(msg.sender).transfer(withdrawal);
		// (bool success, ) = payable(msg.sender).call{ value: withdrawal }("");
		_eventEmitter().emitWithdraw(withdrawal, true);
	}

	/// @dev Proposes the metadata to the token you bought.
	///      Users can propose many times as long as it is accepted.
	/// @param tokenId uint256 of the token ID
	/// @param metadata string of the proposal metadata
	function propose(uint256 tokenId, string memory metadata) external {
		require(ownerOf(tokenId) == msg.sender, "KD012");
		_proposeToRight(tokenId, metadata);
		_eventEmitter().emitPropose(tokenId, metadata);
	}

	/// @dev Accepts the proposal.
	/// @param tokenId uint256 of the token ID
	function acceptProposal(uint256 tokenId) external onlyMedia {
		string memory metadata = proposed[tokenId].content;
		require(bytes(metadata).length != 0, "KD130");
		require(ownerOf(tokenId) == proposed[tokenId].proposer, "KD131");
		_acceptProposal(tokenId, metadata);
		_eventEmitter().emitAcceptProposal(tokenId, metadata);
	}

	/// @dev Denies the submitted proposal, mentioning what is the problem.
	/// @param tokenId uint256 of the token ID
	/// @param reason string of the reason why it is rejected
	/// @param offensive bool if the content would offend somebody
	function denyProposal(
		uint256 tokenId,
		string memory reason,
		bool offensive
	) external onlyMedia {
		string memory metadata = proposed[tokenId].content;
		require(bytes(metadata).length != 0, "KD130");
		deniedReasons[tokenId].push(Denied(reason, offensive));
		_eventEmitter().emitDenyProposal(tokenId, metadata, reason, offensive);
	}

	/// @dev Overrides transferFrom to emit an event from the common emitter.
	function transferFrom(
		address from,
		address to,
		uint256 tokenId
	) public override {
		super.transferFrom(from, to, tokenId);
		_eventEmitter().emitTransferCustom(from, to, tokenId);
	}

	/// @dev Overrides transferFrom to emit an event from the common emitter.
	function safeTransferFrom(
		address from,
		address to,
		uint256 tokenId
	) public override {
		super.safeTransferFrom(from, to, tokenId);
		_eventEmitter().emitTransferCustom(from, to, tokenId);
	}

	/// @dev Returns ID based on the space metadata, display start timestamp, and
	///      display end timestamp. These three makes it the unique.
	/// @param spaceMetadata uint256 of the space metadata
	/// @param displayStartTimestamp uint256 of the start timestamp for the display
	/// @param displayEndTimestamp uint256 of the end timestamp for the display
	function adId(
		string memory spaceMetadata,
		uint256 displayStartTimestamp,
		uint256 displayEndTimestamp
	) public pure returns (uint256) {
		return Ad.id(spaceMetadata, displayStartTimestamp, displayEndTimestamp);
	}

	/// @dev Returns the balacne deposited on the proxy contract.
	function balance() public view returns (uint256) {
		return address(this).balance;
	}

	/// @dev Returns the withdrawal amount.
	function withdrawalAmount() public view returns (uint256) {
		return address(this).balance - _biddingTotal - _offeredTotal;
	}

	/// @dev Displays the ad content that is approved by the media owner.
	/// @param spaceMetadata string of the space metadata
	function display(string memory spaceMetadata)
		external
		view
		returns (string memory)
	{
		uint256[] memory tokenIds = tokenIdsOf(spaceMetadata);
		for (uint256 i = 0; i < tokenIds.length; i++) {
			Ad.Period memory period = periods[tokenIds[i]];
			if (
				period.displayStartTimestamp <= _blockTimestamp() &&
				period.displayEndTimestamp >= _blockTimestamp()
			) {
				return accepted[tokenIds[i]];
			}
		}
		return "";
	}

	function _checkBeforeReceiveToken(uint256 tokenId) internal view {
		require(periods[tokenId].pricing == Ad.Pricing.BIDDING, "KD124");
		require(!periods[tokenId].sold, "KD121");
		require(periods[tokenId].saleEndTimestamp < _blockTimestamp(), "KD125");
	}

	function _collectFees(uint256 value) internal {
		payable(vaultAddress()).transfer(value);
	}
}
