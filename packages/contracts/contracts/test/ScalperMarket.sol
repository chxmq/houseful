// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721Like {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

contract ScalperMarket {
    function buyListing(IERC721Like ticket, address seller, uint256 tokenId) external payable {
        ticket.transferFrom(seller, msg.sender, tokenId);
        (bool ok, ) = payable(seller).call{value: msg.value}("");
        require(ok);
    }
}
