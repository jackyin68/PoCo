pragma solidity ^0.4.19;

import "wallet.sol";


contract PoCo is wallet
{
	enum Status { Null, Pending, Locked, Finished }
	struct Task
	{
		Status  status;
		address chair;
		uint256 reward;
		uint256 stake;
	}
	struct Contribution
	{
		bool    submitted;
		uint256 resultHash;
		uint256 resultSign;
		int256  balance;
	}

	mapping(uint256 => Task)                             public m_tasks;
	mapping(uint256 => address[])                        public m_tasksWorkers;
	mapping(uint256 => mapping(address => Contribution)) public m_tasksContributions;

	function createTask(uint256 _taskID, uint _reward, uint _stake) public
	{
		require(m_tasks[_taskID].status == Status.Null);
		m_tasks[_taskID].status = Status.Pending;
		m_tasks[_taskID].reward = _reward;
		m_tasks[_taskID].stake  = _stake;
		m_tasks[_taskID].chair  = msg.sender;
	}

	function submit(uint256 _taskID, uint256 _resultHash, uint256 _resultSign) public
	{
		require(m_tasks[_taskID].status == Status.Pending);
		require(!m_tasksContributions[_taskID][msg.sender].submitted);

		lock(msg.sender, m_tasks[_taskID].stake);

		m_tasksWorkers[_taskID].push(msg.sender);
		m_tasksContributions[_taskID][msg.sender].submitted  = true;
		m_tasksContributions[_taskID][msg.sender].resultHash = _resultHash;
		m_tasksContributions[_taskID][msg.sender].resultSign = _resultSign;

	}

	function finalizeTask(uint256 _taskID, uint256 _consensus) public
	{
		require(m_tasks[_taskID].chair  == msg.sender);
		require(m_tasks[_taskID].status == Status.Locked);
		m_tasks[_taskID].status = Status.Finished;

		uint    i;
		address w;
		uint256 reward     = m_tasks[_taskID].reward;
		uint256 cntWinners = 0;
		for (i=0; i<m_tasksWorkers[_taskID].length; ++i)
		{
			w = m_tasksWorkers[_taskID][i];
			if (m_tasksContributions[_taskID][w].resultHash == _consensus)
			{
				++cntWinners;
			}
			else
			{
				reward += m_tasks[_taskID].stake;
			}
		}

		uint256 individualReward = reward / cntWinners;
		for (i=0; i<m_tasksWorkers[_taskID].length; ++i)
		{
			w = m_tasksWorkers[_taskID][i];
			if (m_tasksContributions[_taskID][w].resultHash == _consensus)
			{
				unlock(w, m_tasks[_taskID].stake);
				reward(w, individualReward);
				m_tasksContributions[_taskID][msg.sender].balance = individualReward;
			}
			else
			{
				seize(w, m_tasks[_taskID].stake);
				// No Reward
				m_tasksContributions[_taskID][msg.sender].balance =  -m_tasks[_taskID].stake;
			}
		}
	}

	function lock(uint256 _taskID) public
	{
		require(m_tasks[_taskID].chair  == msg.sender);
		require(m_tasks[_taskID].status == Status.Pending);
		m_tasks[_taskID].status = Status.Locked;
	}

	function unlock(uint256 _taskID) public
	{
		require(m_tasks[_taskID].chair  == msg.sender);
		require(m_tasks[_taskID].status == Status.Locked);
		m_tasks[_taskID].status = Status.Pending;
	}
}