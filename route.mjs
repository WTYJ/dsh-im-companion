function opaqueId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 512
    && value.trim() === value
    && !/[\s:\u0000-\u001f\u007f]/u.test(value);
}

function afterPrefix(key, prefix) {
  const marker = `${prefix}:`;
  if (!key.startsWith(marker)) return null;
  const value = key.slice(marker.length);
  return opaqueId(value) ? value : null;
}

function simpleRoute(key, defs) {
  for (const [prefix, kind, field] of defs) {
    const value = afterPrefix(key, prefix);
    if (value) return { kind, route: { [field]: value } };
  }
  return null;
}

/**
 * Map the result of `ctx.dshIm.describeConversation(sessionId)` into a draft
 * target accepted by `ctx.dshIm.send(botId, draftTarget, text, options)`.
 */
export function draftTargetFromConversation(described) {
  const channel = described?.channel;
  const key = described?.conversationKey;
  if (typeof channel !== 'string' || typeof key !== 'string') return null;

  switch (channel) {
    case 'qq':
      return simpleRoute(key, [
        ['c2c', 'user', 'userOpenId'],
        ['group', 'group', 'groupOpenId'],
      ]);
    case 'weixin':
      return simpleRoute(key, [['p2p', 'user', 'toUserId']]);
    case 'feishu': {
      const openId = afterPrefix(key, 'p2p');
      if (openId?.startsWith('ou_')) return { kind: 'user', route: { openId } };
      return simpleRoute(key, [['group', 'group', 'chatId']]);
    }
    case 'dingtalk':
      return simpleRoute(key, [
        ['p2p', 'user', 'userId'],
        ['group', 'group', 'openConversationId'],
      ]);
    case 'wecom':
      return simpleRoute(key, [
        ['direct', 'user', 'chatId'],
        ['group', 'group', 'chatId'],
      ]);
    case 'wecom-app':
      return simpleRoute(key, [['p2p', 'user', 'chatId']]);
    case 'telegram': {
      const m = /^(direct|group):(-?\d+)(?::([1-9]\d*))?$/.exec(key);
      if (!m) return null;
      if (m[3] === undefined) return { kind: 'chat', route: { chatId: m[2] } };
      return { kind: 'topic', route: { chatId: m[2], messageThreadId: Number(m[3]) } };
    }
    case 'discord': {
      const m = /^(?:direct|group):(\d{1,32})$/.exec(key);
      return m ? { kind: 'channel', route: { channelId: m[1] } } : null;
    }
    case 'slack': {
      const direct = afterPrefix(key, 'direct');
      if (direct) return { kind: 'conversation', route: { channelId: direct } };
      const m = /^group:([^:]+):(\d{1,20}(?:\.\d{1,20})?)$/.exec(key);
      return m ? { kind: 'thread', route: { channelId: m[1], threadTs: m[2] } } : null;
    }
    case 'whatsapp': {
      const direct = /^direct:(\d{5,32}@(s\.whatsapp\.net|lid))$/.exec(key);
      if (direct) return { kind: 'user', route: { jid: direct[1] } };
      const group = /^group:(\d{5,32}(?:-\d{1,32})?@g\.us)$/.exec(key);
      return group ? { kind: 'group', route: { jid: group[1] } } : null;
    }
    default:
      return null;
  }
}
