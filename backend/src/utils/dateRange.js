export function getDateRange({ range = "daily", startDate, endDate } = {}) {
  const now = new Date();
  let start;
  let end = new Date(now);

  switch (range) {
    case "daily": {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "weekly": {
      start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "monthly": {
      start = new Date(now);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "custom": {
      if (!startDate || !endDate) {
        throw new Error("startDate and endDate are required for custom range");
      }
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      break;
    }
    default: {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    }
  }

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date range");
  }

  return { start, end };
}

export function roundCurrency(value) {
  return Number(Number(value).toFixed(2));
}
