pragma solidity 0.4.24;

/**
 * @title Proxy
 * @dev Gives the possibility to delegate any call to a foreign implementation.
 */
contract Proxy {
    /**
        Constants
     */

    // Storage position of the address of the current implementation
    bytes32 private constant implementationPosition = keccak256("l2.app.proxy.implementation");

    // Storage position of the owner, or a multisig contract address
    bytes32 private constant ownerPosition = keccak256("l2.app.proxy.owner");

    /**
        Constructor
     */

    constructor (address owner, address implementation) public {
        require(owner != address(0x0), "invalid owner");
        require(implementation != address(0x0), "invalid implementation");
        setProxyOwner(owner);
        setImplementation(implementation);
    }

    /**
        Modifiers
     */

    /**
    * @dev Throws if called by any account other than the owner.
    */
    modifier onlyProxyOwner() {
        require(msg.sender == proxyOwner(), "invild sender");
        _;
    }

    /**
        Functions
     */

    /**
    * @dev Tells the address of the owner
    * @return the address of the owner
    */
    function proxyOwner() public view returns (address owner) {
        bytes32 position = ownerPosition;
        // solium-disable-next-line security/no-inline-assembly
        assembly { owner := sload(position) }
    }

    /**
    * @dev Sets the address of the owner
    */
    function setProxyOwner(address newProxyOwner) internal {
        bytes32 position = ownerPosition;
        // solium-disable-next-line security/no-inline-assembly
        assembly { sstore(position, newProxyOwner) }
        
    }

    /**
    * @dev Allows the current owner to transfer control of the contract to a newOwner.
    * @param newOwner The address to transfer ownership to.
    */
    function transferProxyOwnership(address newOwner) public onlyProxyOwner {
        require(newOwner != address(0x0), "invalid newOwner");
        emit ProxyOwnershipTransferred(proxyOwner(), newOwner);
        setProxyOwner(newOwner);
    }

    /**
    * @dev Tells the address of the current implementation
    * @return address of the current implementation
    */
    function implementation() public view returns (address impl) {
        bytes32 position = implementationPosition;
        // solium-disable-next-line security/no-inline-assembly
        assembly { impl := sload(position) }
    }

    /**
    * @dev Sets the address of the current implementation
    * @param newImplementation address representing the new implementation to be set
    */
    function setImplementation(address newImplementation) internal {
        bytes32 position = implementationPosition;
        // solium-disable-next-line security/no-inline-assembly
        assembly { sstore(position, newImplementation) }
    }

    /**
    * @dev Allows the proxy owner to upgrade the current version of the proxy.
    * @param newImplementation representing the address of the new implementation to be set.
    */
    function upgradeTo(address newImplementation) public onlyProxyOwner {
        address currentImplementation = implementation();
        require(currentImplementation != newImplementation, "invalid new implementation");
        setImplementation(newImplementation);
        emit Upgraded(newImplementation);
    }

    /**
    * @dev Allows the proxy owner to upgrade the current version of the proxy and call the new implementation
    * to initialize whatever is needed through a low level call.
    * @param newImplementation representing the address of the new implementation to be set.
    * @param data represents the msg.data to bet sent in the low level call. This parameter may include the function
    * signature of the implementation to be called with the needed payload
    */
    function upgradeToAndInitialize(address newImplementation, bytes memory data) public payable onlyProxyOwner {
        upgradeTo(newImplementation);

        // solium-disable-next-line security/no-call-value
        (bool result, ) = address(this).call.value(msg.value)(data);
        require(result, "initialize revert");
    }

    /**
        Events
    */

    /**
    * @dev This event will be emitted every time the implementation gets upgraded
    * @param implementation representing the address of the upgraded implementation
    */
    event Upgraded(address indexed implementation);


    /**
    * @dev Event to show ownership has been transferred
    * @param previousOwner representing the address of the previous owner
    * @param newOwner representing the address of the new owner
    */
    event ProxyOwnershipTransferred(address previousOwner, address newOwner);


    /**
        Fallback
     */

    /**
    * @dev Fallback function allowing to perform a delegatecall to the given implementation.
    * This function will return whatever the implementation call returns
    */
    function () 
        external
        payable 
    {
        address _impl = implementation();
        require(_impl != address(0), "invalid implementation address");

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let result := delegatecall(gas, _impl, ptr, calldatasize, 0, 0)
            let size := returndatasize
            returndatacopy(ptr, 0, size)

            switch result
            case 0 { revert(ptr, size) }
            default { return(ptr, size) }
        }
    }
}
