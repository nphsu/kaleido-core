// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "./Ad.sol";

library Sale {
	struct Bidding {
		uint256 tokenId;
		address bidder;
		uint256 price;
	}
	struct Offer {
		string spaceMetadata;
		uint256 displayStartTimestamp;
		uint256 displayEndTimestamp;
		address sender;
		uint256 price;
	}
	struct Appeal {
		uint256 tokenId;
		address sender;
		uint256 price;
		string content;
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
		} else if (period.pricing == Ad.Pricing.OFFER) {
			return period.minPrice;
		} else if (period.pricing == Ad.Pricing.APPEAL) {
			return period.minPrice;
		} else {
			return 0;
		}
	}
}
