// ============================================================
// Realtime Cloud Relay (Sıfır Kurulumlu, Cihazlar Arası Canlı Senkron)
// MQTT over WebSockets (WSS) kullanarak PC, telefon ve tabletler
// arasında hesap/API anahtarı gerektirmeden anında canlı senkronizasyon sağlar.
// ============================================================
import mqtt, { type MqttClient } from 'mqtt';

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC_PREFIX = 'masa_poker_app_v2/';

let client: MqttClient | null = null;
let isConnected = false;
const activeSubscriptions = new Map<string, Set<(data: any) => void>>();

function getClientId(): string {
  if (typeof window === 'undefined') return 'server';
  let cid = sessionStorage.getItem('masa_mqtt_client_id');
  if (!cid) {
    cid = 'dev_' + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem('masa_mqtt_client_id', cid);
  }
  return cid;
}

export function initCloudRelay() {
  if (typeof window === 'undefined' || client) return;

  try {
    client = mqtt.connect(BROKER_URL, {
      clientId: getClientId(),
      clean: true,
      keepalive: 30,
      reconnectPeriod: 2500,
      connectTimeout: 8000,
    });

    client.on('connect', () => {
      isConnected = true;
      // Aktif abonelikleri tekrar abone yap
      for (const key of activeSubscriptions.keys()) {
        client?.subscribe(TOPIC_PREFIX + key, { qos: 1 });
      }
    });

    client.on('reconnect', () => {
      isConnected = true;
    });

    client.on('close', () => {
      isConnected = false;
    });

    client.on('error', (err) => {
      console.warn('Realtime cloud relay uyarısı:', err?.message || err);
      isConnected = false;
    });

    client.on('message', (topic, payload) => {
      try {
        if (!topic.startsWith(TOPIC_PREFIX)) return;
        const key = topic.slice(TOPIC_PREFIX.length);
        const text = payload.toString('utf-8');
        if (!text) return;
        const parsed = JSON.parse(text);

        // Gönderici kendimizse döngüye girmemek için kontrol
        if (parsed?._sender === getClientId()) return;

        const data = parsed?._payload !== undefined ? parsed._payload : parsed;
        const listeners = activeSubscriptions.get(key);
        if (listeners) {
          listeners.forEach((fn) => {
            try {
              fn(data);
            } catch (e) {
              console.error('Cloud subscriber callback error:', e);
            }
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

export function cloudPublish(key: string, data: any) {
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
    client.publish(TOPIC_PREFIX + key, payload, { qos: 1, retain: true });
  } catch (err) {
    console.warn('Cloud publish error:', err);
  }
}

export function cloudSubscribe(key: string, onData: (data: any) => void): () => void {
  initCloudRelay();

  let set = activeSubscriptions.get(key);
  if (!set) {
    set = new Set();
    activeSubscriptions.set(key, set);
    if (client && isConnected) {
      client.subscribe(TOPIC_PREFIX + key, { qos: 1 });
    }
  }
  set.add(onData);

  return () => {
    set?.delete(onData);
    if (set && set.size === 0) {
      activeSubscriptions.delete(key);
      if (client && isConnected) {
        client.unsubscribe(TOPIC_PREFIX + key);
      }
    }
  };
}
