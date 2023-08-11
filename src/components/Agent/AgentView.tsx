import { FC, useCallback, useEffect, useRef, useState } from 'react';
import va from '@vercel/analytics';
import {
  AgentStatus,
  AgentType,
  Execution,
  Message,
  MessageBlock,
  SelectItem,
  UserSettings,
  Block,
} from '@/types';
import { AgentInput } from './AgentInput';
import AgentMessage from './AgentMessage';
import { AgentParameter } from './AgentParameter';
import { ProjectTile } from './ProjectTile';
import { AgentMessageHeader } from './AgentMessageHeader';
import {
  getExportAgentMessage,
  getMessageBlocks,
  loadingAgentMessage,
  groupMessages,
} from '../../utils/message';
import { BabyAGI } from '@/agents/babyagi';
import { BabyDeerAGI } from '@/agents/babydeeragi/executer';
import { AGENT, ITERATIONS, MODELS, SETTINGS_KEY } from '@/utils/constants';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { useExecution } from '@/hooks/useExecution';
import { useExecutionStatus } from '@/hooks/useExecutionStatus';
import { translate } from '../../utils/translate';
import axios from 'axios';
import { taskCompletedNotification } from '@/utils/notification';
import { useTranslation } from 'next-i18next';
import { IntroGuide } from './IntroGuide';
import { BabyElfAGI } from '@/agents/babyelfagi/executer';
import { SkillsList } from './SkillList';
import { useAgent } from '@/hooks/useAgent';
import { AgentBlock } from './AgentBlock';

export const AgentView: FC = () => {
  const [model, setModel] = useState<SelectItem>(MODELS[1]);
  const [iterations, setIterations] = useState<SelectItem>(ITERATIONS[0]);
  const [objective, setObjective] = useState<string>('');
  const [firstTask, setFirstTask] = useState<string>(
    translate('FIRST_TASK_PLACEHOLDER', 'constants'),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageBlocks, setMessageBlocks] = useState<MessageBlock[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    type: 'ready',
  });
  const [agent, setAgent] = useState<BabyAGI | BabyDeerAGI | BabyElfAGI | null>(
    null,
  );
  const [selectedAgent, setSelectedAgent] = useState<SelectItem>(AGENT[0]);
  const { i18n } = useTranslation();
  const [language, setLanguage] = useState(i18n.language);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    addExecution,
    updateExec,
    executions,
    selectedExecutionId,
    selectExecution,
  } = useExecution();
  const { isExecuting, setExecuting } = useExecutionStatus();

  const scrollToBottom = useCallback(() => {
    const behavior = isExecuting ? 'smooth' : 'auto';
    messagesEndRef.current?.scrollIntoView({ behavior: behavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageBlocks]);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    if (selectedExecutionId) {
      const selectedExecution = executions.find(
        (exe) => exe.id === selectedExecutionId,
      );
      if (selectedExecution) {
        setMessages(selectedExecution.messages);
      }
    } else {
      setMessages([]);
      setObjective('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExecutionId]);

  useEffect(() => {
    const execution = executions.find((exe) => exe.id === selectedExecutionId);
    if (execution) {
      const updatedExecution: Execution = {
        ...execution,
        messages: messages,
      };
      updateExec(updatedExecution);
    }

    const blocks = getMessageBlocks(messages, isExecuting);
    setMessageBlocks(blocks);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    setLanguage(i18n.language);
  }, [i18n]);

  // manage data
  const saveNewData = async () => {
    const execution: Execution = {
      id: uuidv4(),
      name: objective,
      date: new Date().toISOString(),
      params: {
        objective: objective,
        model: model,
        iterations: iterations,
        firstTask: firstTask,
        agent: selectedAgent.id as AgentType,
      },
      messages: messages,
    };

    selectExecution(execution.id);
    await new Promise((resolve) => {
      addExecution(execution);
      resolve(null);
    });

    return execution;
  };

  // handler functions
  const messageHandler = (message: Message) => {
    setMessages((currentMessages) => {
      if (selectedAgent.id !== 'babyagi') {
        // if the message.type and id are the same, overwrite the message
        const index = currentMessages.findIndex(
          (msg) => msg.type === message.type && msg.id === message.id,
        );
        if (index !== -1) {
          const newMessages = [...currentMessages];
          newMessages[index] = message;
          return newMessages;
        }
      }

      const updatedMessages = [...currentMessages, message];

      // show toast notification
      if (message.type === 'complete' || message.type === 'end-of-iterations') {
        toast.success(translate('ALL_TASKS_COMPLETED_TOAST', 'agent'));
        taskCompletedNotification(objective);
      } else if (message.type === 'done') {
        toast.success(translate('TASK_COMPLETED_TOAST', 'agent'));
      }

      return updatedMessages;
    });
  };

  const inputHandler = (value: string) => {
    setObjective(value);
  };

  const cancelHandle = () => {
    setAgent(null);
    setExecuting(false);
  };

  const stopHandler = () => {
    va.track('Stop');
  };

  const startHandler = async () => {
    saveNewData();
    va.track('Start', {
      model: model.id,
      agent: selectedAgent.id,
      iterations: iterations.id,
    });
  };

  const clearHandler = () => {
    reset();
    selectExecution(undefined);
    setAgentStatus({ type: 'ready' });

    va.track('New');
  };

  const copyHandler = () => {
    navigator.clipboard.writeText(getExportAgentMessage(agentBlocks));
    toast.success(translate('COPIED_TO_CLIPBOARD', 'agent'));

    va.track('CopyToClipboard');
  };

  const downloadHandler = () => {
    const element = document.createElement('a');
    const filename =
      objective.length > 0
        ? `${objective.replace(/\s/g, '_')}.txt`
        : 'download.txt';
    const file = new Blob(['\uFEFF' + getExportAgentMessage(agentBlocks)], {
      type: 'text/plain;charset=utf-8',
    });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();

    va.track('Download');
  };

  const feedbackHandler = (isGood: boolean) => {
    let selectedExecution = executions.find(
      (exe) => exe.id === selectedExecutionId,
    );
    if (selectedExecution) {
      setMessages(selectedExecution.messages);
    }
    const feedbackObjective = selectedExecution?.params.objective;
    const feedbackModel = selectedExecution?.params.model.id;
    const feedbackAgent = selectedExecution?.params.agent;
    const feedbackIterations = Number(selectedExecution?.params.iterations.id);

    let lastResult = messages
      .filter(
        (message) =>
          message.type === 'task-output' || message.type === 'task-result',
      )
      .pop()?.text;
    if (feedbackAgent === 'babybeeagi') {
      lastResult = messages
        .filter((message) => message.type === 'task-result-summary')
        .pop()?.text;
    }
    const lastTaskList = messages
      .filter((message) => message.type === 'task-list')
      .pop()?.text;
    const sessionSummary = messages
      .filter((message) => message.type === 'session-summary')
      .pop()?.text;
    const iterationNumber = messages.filter(
      (message) => message.type === 'done',
    ).length;
    const finished =
      messages.filter(
        (message) =>
          message.type === 'complete' || message.type === 'end-of-iterations',
      ).length > 0;
    const output = getExportText(messages);

    axios.post('/api/feedback', {
      objective: feedbackObjective,
      evaluation: isGood ? 'good' : 'bad',
      model: feedbackModel,
      agent: feedbackAgent,
      iterations: feedbackIterations,
      last_result: lastResult,
      task_list: lastTaskList,
      session_summary: sessionSummary,
      iteration_number: iterationNumber,
      finished: finished,
      output: output,
    });

    toast.success(translate('FEEDBACK_SUBMITTED_TOAST', 'constants'));

    // update execution
    if (selectedExecution) {
      selectedExecution.evaluation = isGood ? 'good' : 'bad';
      updateExec(selectedExecution);
    }
  };

  const userInputHandler = async (id: number, text: string) => {
    if (agent instanceof BabyDeerAGI) {
      agent.userInput(id, text);
    }
  };

  const needSettingsAlert = () => {
    const useUserApiKey = process.env.NEXT_PUBLIC_USE_USER_API_KEY;
    if (useUserApiKey === 'false') {
      return false;
    }

    const userSettings = localStorage.getItem(SETTINGS_KEY);
    if (userSettings) {
      const { openAIApiKey } = JSON.parse(userSettings) as UserSettings;
      if (openAIApiKey && openAIApiKey?.length > 0) {
        return false;
      }
    }
    return true;
  };

  const enabledGPT4 = async () => {
    const userSettings = localStorage.getItem(SETTINGS_KEY);
    if (!userSettings) {
      return false;
    }

    const { enabledGPT4 } = JSON.parse(userSettings) as UserSettings;
    if (enabledGPT4 === undefined) {
      return true; // If no value is given, its enabled by default
    }

    return enabledGPT4;
  };

  const currentEvaluation = () => {
    const selectedExecution = executions.find(
      (exe) => exe.id === selectedExecutionId,
    );
    if (selectedExecution) {
      return selectedExecution.evaluation;
    }
    return undefined;
  };

  const currentAgentId = () => {
    if (isExecuting) {
      return selectedAgent.id;
    }

    const selectedExecution = executions.find(
      (exe) => exe.id === selectedExecutionId,
    );
    if (selectedExecution) {
      return selectedExecution.params.agent;
    }
    return undefined;
  };

  const skills = () => {
    if (selectedAgent.id === 'babyelfagi') {
      const elf = new BabyElfAGI(
        objective,
        model.id,
        messageHandler,
        setAgentStatus,
        cancelHandle,
        language,
        false,
      );
      const skills = elf.skillRegistry.getAllSkills();
      const skillInfos = skills.map((skill) => {
        const skillInfo = {
          name: skill.name,
          description: skill.descriptionForHuman,
          icon: skill.icon,
          badge: skill.type,
        };
        return skillInfo;
      });
      return skillInfos;
    }
    return [];
  };

  const {
    input,
    agentMessages,
    isRunning,
    handleInputChange,
    handleSubmit,
    handleCancel,
    reset,
  } = useAgent({
    api: '/api/agent',
    onSubmit: startHandler,
    onCancel: stopHandler,
  });

  const [agentBlocks, setAgentBlocks] = useState<Block[]>([]);

  useEffect(() => {
    const newGroupedMessages = groupMessages(agentMessages);
    setAgentBlocks(newGroupedMessages);
  }, [agentMessages]);

  return (
    <div className="overflow-none relative flex-1 bg-white dark:bg-black">
      <div className="text-black">
        <p className="w-full p-4 text-center  text-red-500">
          for development use only
        </p>
      </div>
      {agentMessages.length === 0 ? (
        <>
          <AgentParameter
            model={model}
            setModel={setModel}
            iterations={iterations}
            setIterations={setIterations}
            firstTask={firstTask}
            setFirstTask={setFirstTask}
            agent={selectedAgent}
            setAgent={setSelectedAgent}
          />
          {selectedAgent.id === 'babyelfagi' && (
            <SkillsList skills={skills()} />
          )}
          <div className="h-[calc(100vh-600px)]">
            <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
              <ProjectTile />
              {(selectedAgent.id === 'babydeeragi' ||
                selectedAgent.id === 'babyelfagi') && (
                <IntroGuide
                  onClick={(value) => setObjective(value)}
                  agent={selectedAgent.id}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="max-h-full overflow-scroll">
          <AgentMessageHeader model={model} agent={selectedAgent} />
          {agentBlocks.map((block, index) => (
            <AgentBlock key={index} block={block} />
          ))}
          {isRunning && (
            <AgentMessage message={loadingAgentMessage(agentStatus)} />
          )}
          <div
            className="h-[162px] bg-white dark:bg-black"
            ref={messagesEndRef}
          />
        </div>
      )}
      <AgentInput
        value={input}
        handleSubmit={handleSubmit}
        handleInputChange={handleInputChange}
        handleCancel={handleCancel}
        handleClear={clearHandler}
        handleCopy={copyHandler}
        handleDownload={downloadHandler}
        handleFeedback={feedbackHandler}
        isRunning={isRunning}
        hasMessages={agentMessages.length > 0}
        type={selectedAgent.id}
        evaluation={currentEvaluation()}
      />
    </div>
  );
};
