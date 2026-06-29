// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for Arc Testnet's optional USDC ERC-20 interface.
/// @dev The Arc USDC ERC-20 interface uses 6 decimals and is used for approve/transferFrom.
interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/// @title ArcProofEscrow
/// @notice A compact, non-custodial escrow contract for digital-service agreements.
/// @dev Prototype only. Obtain a professional security audit before holding production funds.
contract ArcProofEscrow {
    enum JobState {
        Open,
        Funded,
        Delivered,
        Completed,
        Disputed,
        Refunded
    }

    struct Job {
        address client;
        address provider;
        address evaluator;
        uint96 amount;
        uint64 createdAt;
        uint64 expiresAt;
        bytes32 descriptionHash;
        bytes32 deliverableHash;
        JobState state;
    }

    IERC20 public immutable usdc;
    address public immutable arbiter;
    uint256 public nextJobId = 1;
    uint256 private _lock = 1;

    mapping(uint256 => Job) private _jobs;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, uint96 amount);
    event JobFunded(uint256 indexed jobId, uint96 amount);
    event DeliverableSubmitted(uint256 indexed jobId, bytes32 indexed deliverableHash);
    event JobCompleted(uint256 indexed jobId, address indexed provider, uint96 amount);
    event DisputeOpened(uint256 indexed jobId, address indexed openedBy);
    event DisputeResolved(uint256 indexed jobId, uint96 providerAmount, uint96 clientAmount);
    event JobRefunded(uint256 indexed jobId, uint96 amount);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidExpiry();
    error InvalidState(JobState actual);
    error Expired();
    error TransferFailed();
    error ReentrantCall();

    modifier nonReentrant() {
        if (_lock != 1) revert ReentrantCall();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address usdc_, address arbiter_) {
        if (usdc_ == address(0) || arbiter_ == address(0)) revert InvalidAddress();
        usdc = IERC20(usdc_);
        arbiter = arbiter_;
    }

    /// @notice Creates an agreement. The client must separately approve and fund it.
    /// @param provider Service-provider wallet that receives settlement after approval.
    /// @param evaluator Address authorized to evaluate delivery. It can be the client.
    /// @param amount Escrow amount in USDC's 6-decimal integer representation.
    /// @param expiresAt Unix timestamp after which an unfurnished job can be refunded.
    /// @param descriptionHash keccak256 hash of the agreed scope / statement of work.
    function createJob(
        address provider,
        address evaluator,
        uint96 amount,
        uint64 expiresAt,
        bytes32 descriptionHash
    ) external returns (uint256 jobId) {
        if (provider == address(0) || evaluator == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();

        jobId = nextJobId++;
        _jobs[jobId] = Job({
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            amount: amount,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            descriptionHash: descriptionHash,
            deliverableHash: bytes32(0),
            state: JobState.Open
        });

        emit JobCreated(jobId, msg.sender, provider, amount);
    }

    /// @notice Locks USDC in this contract. Client must have approved `amount` first.
    function fundJob(uint256 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        if (msg.sender != job.client) revert Unauthorized();
        if (job.state != JobState.Open) revert InvalidState(job.state);
        if (block.timestamp >= job.expiresAt) revert Expired();

        job.state = JobState.Funded;
        _safeTransferFrom(job.client, address(this), job.amount);
        emit JobFunded(jobId, job.amount);
    }

    /// @notice Provider commits a hash of the delivery reference (URL, IPFS CID, Git commit, etc.).
    function submitDeliverable(uint256 jobId, bytes32 deliverableHash) external {
        Job storage job = _jobs[jobId];
        if (msg.sender != job.provider) revert Unauthorized();
        if (job.state != JobState.Funded) revert InvalidState(job.state);
        if (deliverableHash == bytes32(0)) revert InvalidAmount();

        job.deliverableHash = deliverableHash;
        job.state = JobState.Delivered;
        emit DeliverableSubmitted(jobId, deliverableHash);
    }

    /// @notice Client or designated evaluator approves delivery and releases USDC to provider.
    function completeJob(uint256 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        if (msg.sender != job.client && msg.sender != job.evaluator) revert Unauthorized();
        if (job.state != JobState.Delivered) revert InvalidState(job.state);

        job.state = JobState.Completed;
        _safeTransfer(job.provider, job.amount);
        emit JobCompleted(jobId, job.provider, job.amount);
    }

    /// @notice Either party can lock an active agreement for off-chain dispute review.
    function openDispute(uint256 jobId) external {
        Job storage job = _jobs[jobId];
        if (msg.sender != job.client && msg.sender != job.provider) revert Unauthorized();
        if (job.state != JobState.Funded && job.state != JobState.Delivered) revert InvalidState(job.state);

        job.state = JobState.Disputed;
        emit DisputeOpened(jobId, msg.sender);
    }

    /// @notice Designated arbiter splits disputed escrow between provider and client.
    /// @param providerBps Basis points (0-10000) payable to provider.
    function resolveDispute(uint256 jobId, uint16 providerBps) external nonReentrant {
        if (msg.sender != arbiter) revert Unauthorized();
        if (providerBps > 10_000) revert InvalidAmount();

        Job storage job = _jobs[jobId];
        if (job.state != JobState.Disputed) revert InvalidState(job.state);

        uint96 providerAmount = uint96((uint256(job.amount) * providerBps) / 10_000);
        uint96 clientAmount = job.amount - providerAmount;
        job.state = providerAmount == 0 ? JobState.Refunded : JobState.Completed;

        if (providerAmount > 0) _safeTransfer(job.provider, providerAmount);
        if (clientAmount > 0) _safeTransfer(job.client, clientAmount);
        emit DisputeResolved(jobId, providerAmount, clientAmount);
    }

    /// @notice Lets the client reclaim funded escrow after expiry if no delivery was submitted.
    function refundExpired(uint256 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        if (msg.sender != job.client) revert Unauthorized();
        if (job.state != JobState.Funded) revert InvalidState(job.state);
        if (block.timestamp < job.expiresAt) revert InvalidExpiry();

        job.state = JobState.Refunded;
        _safeTransfer(job.client, job.amount);
        emit JobRefunded(jobId, job.amount);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    function _safeTransferFrom(address from, address to, uint256 amount) internal {
        if (!usdc.transferFrom(from, to, amount)) revert TransferFailed();
    }

    function _safeTransfer(address to, uint256 amount) internal {
        if (!usdc.transfer(to, amount)) revert TransferFailed();
    }
}
