import { z } from 'zod';

import { columnNames } from './versions/11.0/colNameList_11.0';

export const zPaloLogs = () =>
  z.object(
    columnNames.reduce((acc, columnName) => {
      acc[columnName] = z.string().nullable();
      return acc;
    }, {})
  );
export const zPaloLogsParams = () =>
  z.object({
    menu: z.string().default('TRAFFIC'),
    timeFrom: z.string(),
    timeTo: z.string(),
    currentPage: z.number().min(1).default(1),
    limit: z.number().min(1).max(500000).default(100),
    cursor: z.string().cuid().optional(),
    searchTerm: z.string().default(''),
  });
