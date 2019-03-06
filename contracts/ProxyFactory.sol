pragma solidity >=0.4.21 <0.6.0;
import "./Proxy.sol";


/// @title proxy factory - Allows creation of multisig wallet.
contract ProxyFactory {

    /*
     * Public functions
     */
    /// @dev Allows verified creation of proxy.
    /// @param _owner initial owner.
    /// @return Returns proxy address.
    function create(address _owner, address _implementation)
        public
        returns (address)
    {
        address instance = address(new Proxy(_owner, _implementation));
        return instance;
    }
}
