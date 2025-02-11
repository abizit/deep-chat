import {CameraFilesServiceConfig, MicrophoneFilesServiceConfig} from '../../types/fileServiceConfigs';
import {ValidateMessageBeforeSending} from '../../types/validateMessageBeforeSending';
import {CustomServiceResponse} from '../../types/customService';
import {Messages} from '../../views/chat/messages/messages';
import {HTTPRequest} from '../../utils/HTTP/HTTPRequest';
import {MessageLimitUtils} from './messageLimitUtils';
import {Websocket} from '../../utils/HTTP/websocket';
import {MessageContent} from '../../types/messages';
import {Request} from '../../types/request';
import {SetFileTypes} from './setFileTypes';
import {Demo} from '../../utils/demo/demo';
import {Result} from '../../types/result';
import {DeepChat} from '../../deepChat';
import {
  KeyVerificationHandlers,
  CompletionsHandlers,
  ServiceFileTypes,
  RequestContents,
  StreamHandlers,
  ServiceIO,
} from '../serviceIO';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class BaseServiceIO implements ServiceIO {
  readonly rawBody: any = {};
  deepChat: DeepChat;
  validateConfigKey = false;
  canSendMessage: ValidateMessageBeforeSending = BaseServiceIO.canSendMessage;
  requestSettings: Request = {};
  fileTypes: ServiceFileTypes = {};
  camera?: CameraFilesServiceConfig;
  recordAudio?: MicrophoneFilesServiceConfig;
  readonly _isStream: boolean = false;
  totalMessagesMaxCharLength?: number;
  maxMessages?: number;
  private readonly _directServiceRequiresFiles: boolean;
  demo?: Demo;
  websocket?: WebSocket;

  constructor(deepChat: DeepChat, existingFileTypes?: ServiceFileTypes, demo?: Demo) {
    this.deepChat = deepChat;
    this.demo = demo;
    Object.assign(this.rawBody, deepChat.request?.additionalBodyProps);
    this._isStream = !!deepChat.stream;
    this.totalMessagesMaxCharLength = deepChat?.requestBodyLimits?.totalMessagesMaxCharLength;
    this.maxMessages = deepChat?.requestBodyLimits?.maxMessages;
    SetFileTypes.set(deepChat, this, existingFileTypes);
    if (deepChat.request) this.requestSettings = deepChat.request;
    if (this.demo) this.requestSettings.url ??= Demo.URL;
    this._directServiceRequiresFiles = !!existingFileTypes && Object.keys(existingFileTypes).length > 0;
    if (this.requestSettings.websocket) Websocket.setup(this, this.requestSettings.websocket);
  }

  private static canSendMessage(text?: string, files?: File[]) {
    return !!(text && text.trim() !== '') || !!(files && files.length > 0);
  }

  verifyKey(_key: string, _keyVerificationHandlers: KeyVerificationHandlers) {}

  private static createCustomFormDataBody(body: any, messages: MessageContent[], files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append(`files`, file));
    Object.keys(body).forEach((key) => formData.append(key, String(body[key])));
    let textMessageIndex = 0;
    messages.forEach((message) => {
      if (message.text) formData.append(`message${(textMessageIndex += 1)}`, JSON.stringify(message));
    });
    return formData;
  }

  private getServiceIOByType(file: File) {
    if (file.type.startsWith('audio') && this.fileTypes.audio) {
      return this.fileTypes.audio;
    }
    if (file.type.startsWith('image')) {
      if (this.fileTypes.gifs && file.type.endsWith('/gif')) return this.fileTypes.gifs;
      if (this.fileTypes.images) return this.fileTypes.images;
      if (this.camera) return this.camera;
    }
    return this.fileTypes.mixedFiles;
  }

  // prettier-ignore
  callServiceAPI(messages: Messages, pMessages: MessageContent[], completionsHandlers: CompletionsHandlers,
      streamHandlers: StreamHandlers, _?: File[]) {
    const body = {messages: pMessages, ...this.rawBody};
    let tempHeaderSet = false; // if the user has not set a header - we need to temporarily set it
    if (!this.requestSettings.headers?.['Content-Type']) {
      this.requestSettings.headers ??= {};
      this.requestSettings.headers['Content-Type'] ??= 'application/json';
      tempHeaderSet = true;
    }
    if (this._isStream) {
      HTTPRequest.requestStream(this, body, messages,
        streamHandlers.onOpen, streamHandlers.onClose, streamHandlers.abortStream);
    } else {
      HTTPRequest.request(this, body, messages, completionsHandlers.onFinish);
    }
    if (tempHeaderSet) delete this.requestSettings.headers?.['Content-Type'];
  }

  // prettier-ignore
  callApiWithFiles(body: any, messages: Messages, completionsHandlers: CompletionsHandlers,
      pMessages: MessageContent[], files: File[]) {
    const formData = BaseServiceIO.createCustomFormDataBody(body, pMessages, files);
    const previousRequestSettings = this.requestSettings;
    const fileIO = this.getServiceIOByType(files[0]);
    this.requestSettings = fileIO?.request || this.requestSettings;
    HTTPRequest.request(this, formData, messages, completionsHandlers.onFinish, false);
    this.requestSettings = previousRequestSettings;
  }

  // prettier-ignore
  callAPI(requestContents: RequestContents, messages: Messages, completionsHandlers: CompletionsHandlers,
      streamHandlers: StreamHandlers) {
    if (!this.requestSettings) throw new Error('Request settings have not been set up');
    const processedMessages = MessageLimitUtils.processMessages(
      requestContents, messages.messages, this.maxMessages, this.totalMessagesMaxCharLength);
    if (this.websocket) {
      const body = {messages: processedMessages, ...this.rawBody};
      Websocket.sendWebsocket(this.websocket, this, body, messages, completionsHandlers.onFinish, false);
    } else if (requestContents.files && !this._directServiceRequiresFiles) {
      this.callApiWithFiles(this.rawBody, messages, completionsHandlers, processedMessages, requestContents.files);
    } else {
      this.callServiceAPI(messages, processedMessages, completionsHandlers, streamHandlers, requestContents.files);
    }
  }

  async extractResultData(result: any | CustomServiceResponse): Promise<Result | {pollingInAnotherRequest: true}> {
    if (result.error) throw result.error;
    return result.result as Result;
  }
}
