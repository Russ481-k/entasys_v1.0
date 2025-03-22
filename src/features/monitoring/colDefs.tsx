import { Flex, Skeleton } from '@chakra-ui/react';
import {
  CellClickedEvent,
  ColDef,
  ICellRendererParams,
  ILoadingCellRendererParams,
  ValueFormatterParams,
} from 'ag-grid-community';

import { zLogs } from './schemas';
import { columnNames } from './versions/11.0/colNameList_11.0';

// 컬럼 설정 함수
const createColumn = (
  columnName: string,
  isLoading: boolean,
  onCellClickChanged: (event: CellClickedEvent<zLogs>) => void,
  timeFormatter: (e: ValueFormatterParams<zLogs>) => string
): ColDef<zLogs> => {
  const column: ColDef<zLogs> = {
    field: columnName,
    headerName: columnName
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toUpperCase(),
    minWidth: 120,
    flex: 1,
    resizable: true,
    suppressSizeToFit: false,
    autoHeaderHeight: false,
    wrapText: false,
    cellStyle: {
      fontSize: '12px',
      padding: '2px 8px',
      lineHeight: '16px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: 'flex',
      alignItems: 'center',
    },
    headerComponentParams: {
      fontSize: '12px',
      fontWeight: 'normal',
      padding: '0 4px',
      lineHeight: '18px',
      height: '26px',
      whiteSpace: 'nowrap',
      overflow: 'visible',
      textOverflow: 'unset',
    },
    onCellClicked: (e) => onCellClickChanged(e),
    cellRenderer: (e: ILoadingCellRendererParams) =>
      !isLoading ? (
        <Flex py="14px">
          <Skeleton h={3} w={columnName.length * 9} borderRadius={2} />
        </Flex>
      ) : (
        e.value
      ),
  };

  // time이 포함된 컬럼에는 valueFormatter 적용
  if (columnName.toLowerCase().includes('time')) {
    column.valueFormatter = timeFormatter;
    column.flex = 0;
    column.minWidth = 160; // 날짜 표시를 위한 충분한 너비 확보

    // 로딩 상태에 따른 셀 렌더러 설정
    column.cellRenderer = (params: ICellRendererParams<zLogs>) => {
      if (!isLoading) {
        return (
          <Flex py="14px">
            <Skeleton h={3} w={140} borderRadius={2} />
          </Flex>
        );
      }
      return params.valueFormatted || params.value;
    };
  }

  // Domain 컬럼에 대한 valueFormatter 추가
  if (columnName.toLowerCase() === 'domain') {
    column.flex = 0;
    column.width = 180;
    column.valueFormatter = (params) => {
      if (typeof params.value === 'string') {
        return params.value.replace(
          /^(?:<\d+>)?(?:[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+/,
          ''
        );
      }
      return params.value;
    };

    column.cellRenderer = (params: ICellRendererParams<zLogs>) => {
      if (!isLoading) {
        return (
          <Flex py="14px">
            <Skeleton h="14px" w="120px" borderRadius={2} />
          </Flex>
        );
      }

      if (typeof params.value === 'string') {
        const formattedValue = params.value.replace(
          /^(?:<\d+>)?(?:[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+/,
          ''
        );
        return <span>{formattedValue}</span>;
      }
      return params.value;
    };
  }

  return column;
};

// 최종 컬럼 정의 함수
export const colDefs = (
  isLoading: boolean,
  onCellClickChanged: (event: CellClickedEvent<zLogs>) => void,
  timeFormatter: (e: ValueFormatterParams<zLogs>) => string
): ColDef<zLogs>[] =>
  columnNames.map((columnName) =>
    createColumn(columnName, isLoading, onCellClickChanged, timeFormatter)
  );
