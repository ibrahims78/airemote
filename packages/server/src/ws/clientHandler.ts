import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import { deviceRegistry } from './registry'
import { getDeviceById, getDevicesByOwner } from '../db/devices'
import { canAccessDevice } from '../lib/deviceAccess'
import type { AuthTokenPayload } from '@airemote/shared'

export function handleClientMessage(
  socket: WebSocket,
  message: { type: string; payload: Record<string, unknown> },
  request: FastifyRequest
): void {
  // Use the authenticated user identity — never trust client-provided userId
  const authUser = request.user as unknown as AuthTokenPayload | undefined
  const authenticatedUserId = authUser?.userId

  switch (message.type) {
    case 'client:subscribe': {
      const { deviceIds } = message.payload as { deviceIds: string[] }
      const userId = authenticatedUserId || ''
      deviceRegistry.addClient(userId, socket, authUser?.role || 'user')

      // v3.2.1 hardening — auto-subscribe to exactly the devices the user may
      // access (own devices for users, all for admins) and scope the initial
      // registry/stats push to that same set.
      const isAdmin = authUser?.role === 'admin'
      ;(async () => {
        const allowed = new Set<string>()
        if (isAdmin) {
          deviceRegistry.subscribeClientToAll(socket)
          for (const id of deviceRegistry.getOnlineDeviceIds()) allowed.add(id)
        } else {
          try {
            const owned = await getDevicesByOwner(userId)
            const ownedIds = new Set(owned.map(d => d.id))
            const requested = (Array.isArray(deviceIds) && deviceIds.length > 0)
              ? deviceIds
              : owned.map(d => d.id)
            for (const deviceId of requested) {
              if (ownedIds.has(deviceId)) {
                allowed.add(deviceId)
                deviceRegistry.subscribeClientToDevice(socket, deviceId)
              }
            }
          } catch { /* no devices — nothing to subscribe */ }
        }

        const onlineDeviceIds = deviceRegistry.getOnlineDeviceIds()
          .filter(id => isAdmin || allowed.has(id))
        socket.send(JSON.stringify({
          type: 'server:registered',
          payload: { message: 'Subscribed', onlineDevices: onlineDeviceIds },
          timestamp: Date.now()
        }))

        // Push current stats only for devices the user may access
        const currentStats = deviceRegistry.getAllDeviceStats()
        for (const { deviceId, stats } of currentStats) {
          if (!isAdmin && !allowed.has(deviceId)) continue
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({
              type: 'broadcast:stats_update',
              payload: { deviceId, stats },
              timestamp: Date.now()
            }))
          }
        }
      })().catch(() => {})
      break
    }

    case 'client:command': {
      const { deviceId, commandId, command } = message.payload as {
        deviceId: string
        commandId: string
        command: string
      }

      // getDeviceById is async — fire and forget with proper handling
      getDeviceById(deviceId).then(device => {
        if (!device) {
          socket.send(JSON.stringify({
            type: 'server:error',
            payload: { commandId, message: 'Device not found' },
            timestamp: Date.now()
          }))
          return
        }

        // v3.2.1 hardening — admin or device owner only
        if (authUser?.role !== 'admin' && device.ownerId !== authUser?.userId) {
          socket.send(JSON.stringify({
            type: 'server:error',
            payload: { commandId, message: 'Forbidden — device access denied' },
            timestamp: Date.now()
          }))
          return
        }

        const sent = deviceRegistry.sendToDevice(deviceId, {
          type: 'server:command',
          payload: { commandId, type: 'shell', command },
          timestamp: Date.now()
        })

        if (!sent) {
          socket.send(JSON.stringify({
            type: 'server:error',
            payload: { commandId, message: 'Device offline' },
            timestamp: Date.now()
          }))
        }
      }).catch(err => {
        console.error('client:command error:', err)
        socket.send(JSON.stringify({
          type: 'server:error',
          payload: { commandId, message: 'Internal error' },
          timestamp: Date.now()
        }))
      })
      break
    }

    default:
      break
  }
}
