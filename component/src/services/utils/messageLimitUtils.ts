import {MessageContent} from '../../types/messages';

export class MessageLimitUtils {
  // prettier-ignore
  // systemMessageLength is currently used for OpenAI
  public static processMessages(messages: MessageContent[],
      systemMessageLength: number, maxMessages?: number, totalMessagesMaxCharLength?: number) {
    let totalCharacters = 0;
    if (maxMessages !== undefined && maxMessages > 0) {
      messages = messages.slice(Math.max(messages.length - maxMessages, 0));
    }
    if (totalMessagesMaxCharLength === undefined) return messages;
    const limit = totalMessagesMaxCharLength - systemMessageLength;
    let i = messages.length - 1;
    for (i; i >= 0; i -= 1) {
      const text = messages[i]?.text;
      if (text !== undefined) {
        totalCharacters += text.length;
        if (totalCharacters > limit) {
          messages[i].text = text.substring(0, text.length - (totalCharacters - limit));
          break;
        }
      }
    }
    return messages.slice(Math.max(i, 0));
  }
}
