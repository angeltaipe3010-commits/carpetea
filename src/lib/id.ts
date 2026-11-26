let n = 0
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${(n++).toString(36)}`
