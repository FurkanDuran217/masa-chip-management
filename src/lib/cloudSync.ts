// ============================================================
// Realtime Cloud Relay (Sıfır Kurulumlu, Cihazlar Arası Canlı Senkron)
// MQTT over WebSockets (WSS) kullanarak PC, telefon ve tabletler
// arasında hesap/API anahtarı gerektirmeden anında canlı senkronizasyon sağlar.
// ============================================================
import mqtt, { type MqttClient } from 'mqtt';

// Güvenilir genel WSS uç noktaları (otomatik failover)
const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

const TOPIC_PREFIX = 'masa_poker_v2/';

let client: MqttClient | null = null;
let isConnected = false;
let currentBrokerIdx = 0;
const activeSubscriptions = new Map<string, Set<(data: any) => void>>();
const subscribedMqttTopics = new Set<string>();

function getClientId(): string {
  if (typeof window === 'undefined') return 'server';
  let cid = sessionStorage.getItem('masa_mqtt_client_id');
  if (!cid) {
    cid = 'dev_' + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem('masa_mqtt_client_id', cid);
  }
  return cid;
}

export function broadcastGroupData(groupId: string) {
  if (typeof window === 'undefined' || !groupId) return;
  try {
    // 1. Grup Bilgisi
    const rawGroups = localStorage.getItem('masa_poker_local_groups');
    if (rawGroups) {
      const groups = JSON.parse(rawGroups);
      if (groups[groupId]) {
        rawMqttPublish(`g/${groupId}/group`, groups[groupId], true);
      }
    }
    // 2. Üyeler
    const rawMembers = localStorage.getItem(`masa_poker_local_members_${groupId}`);
    if (rawMembers) {
      rawMqttPublish(`g/${groupId}/members`, JSON.parse(rawMembers), true);
    }
    // 3. Masalar (Odalar)
    const rawRooms = localStorage.getItem(`masa_poker_local_rooms_${groupId}`);
    if (rawRooms) {
      rawMqttPublish(`g/${groupId}/rooms`, JSON.parse(rawRooms), true);
    }
    // 4. El Geçmişi
    const rawHands = localStorage.getItem(`masa_poker_local_hands_${groupId}`);
    if (rawHands) {
      rawMqttPublish(`g/${groupId}/hands`, JSON.parse(rawHands), true);
    }
    // 5. Havuz Kayıtları
    const rawLedger = localStorage.getItem(`masa_poker_local_ledger_${groupId}`);
    if (rawLedger) {
      rawMqttPublish(`g/${groupId}/ledger`, JSON.parse(rawLedger), true);
    }
  } catch (e) {
    console.warn('broadcastGroupData hatası:', e);
  }
}

export function broadcastAllLocalData() {
  if (typeof window === 'undefined') return;
  try {
    const rawGroups = localStorage.getItem('masa_poker_local_groups');
    if (rawGroups) {
      const groups = JSON.parse(rawGroups);
      Object.keys(groups).forEach((gId) => {
        broadcastGroupData(gId);
      });
    }
  } catch (e) {
    console.warn('Broadcast local data error:', e);
  }
}

export function initCloudRelay() {
  if (typeof window === 'undefined' || client) return;

  const brokerUrl = BROKERS[currentBrokerIdx];

  try {
    client = mqtt.connect(brokerUrl, {
      clientId: getClientId(),
      clean: true,
      keepalive: 30,
      reconnectPeriod: 2500,
      connectTimeout: 8000,
    });

    client.on('connect', () => {
      isConnected = true;
      // Kayıtlı tüm MQTT konularına tekrar abone ol
      subscribedMqttTopics.forEach((topic) => {
        client?.subscribe(TOPIC_PREFIX + topic, { qos: 1 });
      });
      // Yereldeki mevcut grupları ve masaları buluta anında yayınla
      broadcastAllLocalData();
    });

    client.on('reconnect', () => {
      isConnected = true;
    });

    client.on('close', () => {
      isConnected = false;
    });

    client.on('error', (err) => {
      console.warn(`Realtime cloud relay (${brokerUrl}) uyarısı:`, err?.message || err);
      isConnected = false;
      // Diğer brokera otomatik geçiş dene
      if (client && !isConnected) {
        client.end(true);
        client = null;
        currentBrokerIdx = (currentBrokerIdx + 1) % BROKERS.length;
        setTimeout(() => initCloudRelay(), 2000);
      }
    });

    client.on('message', (topic, payload) => {
      try {
        if (!topic.startsWith(TOPIC_PREFIX)) return;
        const subTopic = topic.slice(TOPIC_PREFIX.length);
        const text = payload.toString('utf-8');
        if (!text) return;
        const parsed = JSON.parse(text);

        // Gönderici kendimizse döngüye girmemek için atla
        if (parsed?._sender === getClientId()) return;

        // Eşler arası senkronizasyon talebi geldiyse verilerimizi geri yayınla
        if (subTopic.startsWith('req/')) {
          const reqGroupId = subTopic.replace('req/', '');
          const localGroups = localStorage.getItem('masa_poker_local_groups');
          if (localGroups && localGroups.includes(reqGroupId)) {
            broadcastGroupData(reqGroupId);
          }
          return;
        }

        const data = parsed?._payload !== undefined ? parsed._payload : parsed;

        // Konu eşleştirmeleri ve dinleyicilere dağıtım
        // 1. g/{groupId}/group -> 'groups' anahtarını dinleyenlere { [groupId]: data } olarak ilet
        if (subTopic.startsWith('g/') && subTopic.endsWith('/group')) {
          const parts = subTopic.split('/');
          const gId = parts[1];
          const listeners = activeSubscriptions.get('groups');
          if (listeners) {
            listeners.forEach((fn) => {
              try { fn({ [gId]: data }); } catch (e) { console.error(e); }
            });
          }
        }

        // 2. g/{groupId}/members -> 'members_{groupId}' dinleyenlere
        if (subTopic.startsWith('g/') && subTopic.endsWith('/members')) {
          const parts = subTopic.split('/');
          const gId = parts[1];
          const listeners = activeSubscriptions.get(`members_${gId}`);
          if (listeners) {
            listeners.forEach((fn) => {
              try { fn(data); } catch (e) { console.error(e); }
            });
          }
        }

        // 3. g/{groupId}/rooms -> 'rooms_{groupId}' dinleyenlere
        if (subTopic.startsWith('g/') && subTopic.endsWith('/rooms')) {
          const parts = subTopic.split('/');
          const gId = parts[1];
          const listeners = activeSubscriptions.get(`rooms_${gId}`);
          if (listeners) {
            listeners.forEach((fn) => {
              try { fn(data); } catch (e) { console.error(e); }
            });
          }
        }

        // 4. g/{groupId}/hands -> 'hands_{groupId}' dinleyenlere
        if (subTopic.startsWith('g/') && subTopic.endsWith('/hands')) {
          const parts = subTopic.split('/');
          const gId = parts[1];
          const listeners = activeSubscriptions.get(`hands_${gId}`);
          if (listeners) {
            listeners.forEach((fn) => {
              try { fn(data); } catch (e) { console.error(e); }
            });
          }
        }

        // 5. g/{groupId}/ledger -> 'ledger_{groupId}' dinleyenlere
        if (subTopic.startsWith('g/') && subTopic.endsWith('/ledger')) {
          const parts = subTopic.split('/');
          const gId = parts[1];
          const listeners = activeSubscriptions.get(`ledger_${gId}`);
          if (listeners) {
            listeners.forEach((fn) => {
              try { fn(data); } catch (e) { console.error(e); }
            });
          }
        }

        // Doğrudan anahtar dinleyicisi varsa çağır
        const directListeners = activeSubscriptions.get(subTopic);
        if (directListeners) {
          directListeners.forEach((fn) => {
            try { fn(data); } catch (e) { console.error(e); }
          });
        }
      } catch (err) {
        console.warn('Realtime message parse error:', err);
      }
    });
  } catch (err) {
    console.warn('Cloud relay başlatılamadı:', err);
  }
}

export function isCloudRelayConnected(): boolean {
  return isConnected;
}

function rawMqttPublish(topic: string, data: any, retain = true) {
  if (!client || !isConnected) {
    initCloudRelay();
  }
  if (!client) return;

  try {
    const payload = JSON.stringify({
      _sender: getClientId(),
      _at: Date.now(),
      _payload: data,
    });
    client.publish(TOPIC_PREFIX + topic, payload, { qos: 1, retain });
  } catch (err) {
    console.warn('rawMqttPublish error:', err);
  }
}

function rawMqttSubscribe(topic: string) {
  subscribedMqttTopics.add(topic);
  if (client && isConnected) {
    client.subscribe(TOPIC_PREFIX + topic, { qos: 1 });
  }
}

export function requestSyncForGroup(groupId: string) {
  if (!groupId) return;
  initCloudRelay();
  // Grubun tüm konularını dinle
  rawMqttSubscribe(`g/${groupId}/#`);
  // Eşlerden taze veri talep et
  rawMqttPublish(`req/${groupId}`, { requestedAt: Date.now(), from: getClientId() }, false);
  // Dinleyici olarak da req kanalına abone ol
  rawMqttSubscribe(`req/${groupId}`);
}

export function cloudPublish(key: string, data: any) {
  initCloudRelay();

  if (key === 'groups') {
    if (data && typeof data === 'object') {
      Object.keys(data).forEach((gId) => {
        rawMqttPublish(`g/${gId}/group`, data[gId], true);
      });
      rawMqttPublish('all_groups', data, true);
    }
  } else if (key.startsWith('members_')) {
    const gId = key.replace('members_', '');
    rawMqttPublish(`g/${gId}/members`, data, true);
  } else if (key.startsWith('rooms_')) {
    const gId = key.replace('rooms_', '');
    rawMqttPublish(`g/${gId}/rooms`, data, true);
  } else if (key.startsWith('hands_')) {
    const gId = key.replace('hands_', '');
    rawMqttPublish(`g/${gId}/hands`, data, true);
  } else if (key.startsWith('ledger_')) {
    const gId = key.replace('ledger_', '');
    rawMqttPublish(`g/${gId}/ledger`, data, true);
  } else {
    rawMqttPublish(`custom/${key}`, data, true);
  }
}

export function cloudSubscribe(key: string, onData: (data: any) => void): () => void {
  initCloudRelay();

  let set = activeSubscriptions.get(key);
  if (!set) {
    set = new Set();
    activeSubscriptions.set(key, set);

    if (key === 'groups') {
      rawMqttSubscribe('g/+/group');
      rawMqttSubscribe('all_groups');
    } else if (key.startsWith('members_')) {
      const gId = key.replace('members_', '');
      rawMqttSubscribe(`g/${gId}/members`);
    } else if (key.startsWith('rooms_')) {
      const gId = key.replace('rooms_', '');
      rawMqttSubscribe(`g/${gId}/rooms`);
    } else if (key.startsWith('hands_')) {
      const gId = key.replace('hands_', '');
      rawMqttSubscribe(`g/${gId}/hands`);
    } else if (key.startsWith('ledger_')) {
      const gId = key.replace('ledger_', '');
      rawMqttSubscribe(`g/${gId}/ledger`);
    } else {
      rawMqttSubscribe(`custom/${key}`);
    }
  }
  set.add(onData);

  return () => {
    set?.delete(onData);
    if (set && set.size === 0) {
      activeSubscriptions.delete(key);
    }
  };
}
