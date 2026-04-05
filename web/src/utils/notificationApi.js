import { supabase } from '../config/supabase'

const NOTIFICATION_COLUMNS = 'id, title, message, link, is_read, created_at, type, icon'
const LEGACY_NOTIFICATION_COLUMNS = 'id, title, message, link, is_read, created_at, type'

const isMissingNotificationIconError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return message.includes("'icon' column") && message.includes('notifications')
}

const mapNotification = (record) => ({
  id: record.id,
  title: record.title || '',
  message: record.message || '',
  link: record.link || '',
  read: !!record.is_read,
  timestamp: record.created_at,
  type: record.type || 'default',
  icon: record.icon || null,
})

export const fetchUserNotifications = async (userId, limit = 100) => {
  if (!userId) {
    return []
  }

  let { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error && isMissingNotificationIconError(error)) {
    ;({ data, error } = await supabase
      .from('notifications')
      .select(LEGACY_NOTIFICATION_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit))
  }

  if (error) {
    throw error
  }

  return (data || []).map(mapNotification)
}

export const subscribeToUserNotifications = (userId, onChange) => {
  if (!userId) {
    return () => {}
  }

  const channel = supabase
    .channel(`web-notifications:${userId}:${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        if (typeof onChange === 'function') {
          onChange()
        }
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export const insertUserNotification = async ({
  userId,
  title,
  message,
  type = 'default',
  link = null,
  icon = null,
}) => {
  if (!userId) {
    return null
  }

  const payload = {
    user_id: userId,
    title,
    message,
    type,
    link,
    icon,
  }

  let { data, error } = await supabase
    .from('notifications')
    .insert([payload])
    .select('id')
    .maybeSingle()

  if (error && isMissingNotificationIconError(error)) {
    const { icon: _icon, ...legacyPayload } = payload

    ;({ data, error } = await supabase
      .from('notifications')
      .insert([legacyPayload])
      .select('id')
      .maybeSingle())
  }

  if (error) {
    throw error
  }

  return data
}

export const insertStaffNotifications = async (
  {
    title,
    message,
    type = 'default',
    link = null,
    icon = null,
  },
  roles = ['admin', 'employee'],
) => {
  const normalizedRoles = Array.from(new Set((Array.isArray(roles) ? roles : []).filter(Boolean)))
  if (!normalizedRoles.length) {
    return 0
  }

  const { data: staffUsers, error: usersError } = await supabase
    .from('users')
    .select('id')
    .in('role', normalizedRoles)

  if (usersError) {
    throw usersError
  }

  const uniqueUserIds = Array.from(new Set((staffUsers || []).map((user) => user?.id).filter(Boolean)))
  if (!uniqueUserIds.length) {
    return 0
  }

  const payload = uniqueUserIds.map((userId) => ({
    user_id: userId,
    title,
    message,
    type,
    link,
    icon,
  }))

  let { error: insertError } = await supabase
    .from('notifications')
    .insert(payload)

  if (insertError && isMissingNotificationIconError(insertError)) {
    const legacyPayload = payload.map(({ icon: _icon, ...notification }) => notification)
    ;({ error: insertError } = await supabase
      .from('notifications')
      .insert(legacyPayload))
  }

  if (insertError) {
    throw insertError
  }

  return payload.length
}

export const markNotificationRead = async (notificationId) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  if (error) {
    throw error
  }
}

export const markAllNotificationsRead = async (userId) => {
  if (!userId) {
    return
  }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) {
    throw error
  }
}

export const deleteNotificationRecord = async (notificationId) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)

  if (error) {
    throw error
  }
}

export const clearUserNotifications = async (userId) => {
  if (!userId) {
    return
  }

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw error
  }
}
