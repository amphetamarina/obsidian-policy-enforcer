const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function nextFireTime(now: Date, times: string[]): Date | null {
  const minutes = times.flatMap((t) => {
    const match = HHMM.exec(t);
    if (!match) return [];
    return [Number(match[1]) * 60 + Number(match[2])];
  });

  if (minutes.length === 0) return null;

  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const todaysUpcoming = minutes
    .filter((m) => m > nowMinute)
    .sort((a, b) => a - b);

  const target = todaysUpcoming.length > 0
    ? { minute: todaysUpcoming[0], dayOffset: 0 }
    : { minute: Math.min(...minutes), dayOffset: 1 };

  const fire = new Date(now);
  fire.setDate(fire.getDate() + target.dayOffset);
  fire.setHours(Math.floor(target.minute / 60), target.minute % 60, 0, 0);
  return fire;
}
