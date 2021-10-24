// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "./PeriodManager.sol";
import "./BlockTimestamp.sol";

/// @title PricingStrategy - manages how to sell them out.
/// @author Shumpei Koike - <shumpei.koike@bridges.inc>
abstract contract PricingStrategy is PeriodManager, BlockTimestamp {
	event Buy(uint256 tokenId, uint256 price, address buyer, uint256 timestamp);
	struct Bidding {
		uint256 tokenId;
		address bidder;
		uint256 price;
	}

	/// @dev Maps tokenId with bidding info
	mapping(uint256 => Bidding) public bidding;

	function _buy(uint256 tokenId) internal {
		require(allPeriods[tokenId].pricing == Ad.Pricing.RRP, "not RRP");
		require(!allPeriods[tokenId].sold, "has already sold");
		require(allPeriods[tokenId].minPrice == msg.value, "inappropriate amount");
		allPeriods[tokenId].sold = true;
		emit Buy(tokenId, msg.value, msg.sender, _blockTimestamp());
	}

	/// @dev Returns the current price.
	/// @param tokenId uint256 of the token ID
	function currentPrice(uint256 tokenId) public view returns (uint256) {
		Ad.Period memory period = allPeriods[tokenId];
		if (period.pricing == Ad.Pricing.RRP) {
			return period.minPrice;
		}
		if (period.pricing == Ad.Pricing.DPBT) {
			return
				period.startPrice -
				((period.startPrice - period.minPrice) *
					(_blockTimestamp() - period.salesStartTimestamp)) /
				(period.fromTimestamp - period.salesStartTimestamp);
		}
		if (period.pricing == Ad.Pricing.BIDDING) {
			return bidding[tokenId].price;
		}
		revert("not exist");
	}

	function _startPrice(Ad.Period memory period)
		internal
		pure
		returns (uint256)
	{
		if (period.pricing == Ad.Pricing.RRP) {
			return period.minPrice;
		} else if (period.pricing == Ad.Pricing.DPBT) {
			return period.minPrice * 10;
		} else if (period.pricing == Ad.Pricing.BIDDING) {
			return period.minPrice;
		} else {
			return 0;
		}
	}
}
