/**
 * Device-scoped authorization policy (v3.2.1 hardening, Round 8).
 *
 * Admins may access every device. Regular users may access only the devices
 * they own. Centralized here so REST routes and WebSocket handlers enforce
 * the exact same rule.
 */
import { getDeviceById } from '../db/devices'

export interface DeviceAccessUser {
  userId: string
  role: string
}

export async function canAccessDevice(user: DeviceAccessUser, deviceId: string): Promise<boolean> {
  if (!user || !user.userId) return false
  if (user.role === 'admin') return true
  const device = await getDeviceById(deviceId)
  return !!device && device.ownerId === user.userId
}
