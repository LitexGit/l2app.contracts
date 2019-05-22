pragma solidity >=0.4.24 <0.6.0;

// ERC20 interface
contract ERC20 {
    function totalSupply() public view returns (uint);
    function balanceOf(address tokenOwner) public view returns (uint);
    function allowance(address tokenOwner, address spender) public view returns (uint);
    function transfer(address to, uint tokens) public;
    function approve(address spender, uint tokens) public;
    function transferFrom(address from, address to, uint tokens) public;

    event Transfer(address indexed from, address indexed to, uint tokens);
    event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
}

// Safe token action
library SafeERC20 {
    function safeTransfer(
        ERC20 token, 
        address to, 
        uint256 value
    ) 
        internal 
    {
        // require(token.transfer(to, value), "token transfer failed");
        token.transfer(to, value);
    }

    function safeTransferFrom(
        ERC20 token,
        address from,
        address to,
        uint256 value
    )
        internal
    {
        // require(token.transferFrom(from, to, value), "token tansfer from failed");
        token.transferFrom(from, to, value);
    }

    function safeApprove(
        ERC20 token, 
        address spender, 
        uint256 value
    ) 
        internal 
    {
        // require(token.approve(spender, value), "token approve failed");
        token.approve(spender, value);
    }
}