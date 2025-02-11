package com.server.utils.types;

import java.util.List;

public class DeepChatFileResponse {
  private DeepChatFileResultMessage result;

  public DeepChatFileResponse(List<DeepChatFile> files) {
    result = new DeepChatFileResultMessage(files);
  }

  public DeepChatFileResultMessage getResult() {
    return this.result;
  }
}