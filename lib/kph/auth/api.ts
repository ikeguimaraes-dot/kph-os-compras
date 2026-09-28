import 'server-only'
import { getCurrentUser, type CurrentUser } from './server'
import type { RoleName } from '@kph/db/types/database'

export type UnitScope = { id: string; brand_id: string | null; group_id?: string | null }

export async function authenticateApi() {
  return getCurrentUser()
}

export function canAccessUnit(
  user: CurrentUser,
  unit: UnitScope,
  allowedRoles: ReadonlyArray<RoleName>,
) {
  return user.roles.some((assignment) => {
    if (!allowedRoles.includes(assignment.role)) return false
    if (assignment.role === 'founder') return true
    const hasScope = assignment.unitId || assignment.brandId || assignment.groupId
    if (!hasScope) return true
    return (
      assignment.unitId === unit.id ||
      (!!unit.brand_id && assignment.brandId === unit.brand_id) ||
      (!!unit.group_id && assignment.groupId === unit.group_id)
    )
  })
}
