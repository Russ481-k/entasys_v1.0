import { memo, useCallback, useEffect, useRef } from 'react';

import { Box } from '@chakra-ui/react';
import {
  CellClickedEvent,
  GridReadyEvent,
  ValueFormatterParams,
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { AgGridReact } from 'ag-grid-react';

import { colDefs } from '../colDefs';
import { zLogs } from '../schemas';
import { dummy } from '../versions/11.0/dummy_11.0';

interface GridSectionProps {
  data: (zLogs | null | undefined)[];
  isLoading: boolean;
  onCellClicked: (event: CellClickedEvent<zLogs>) => void;
  colorMode: 'light' | 'dark';
  timeFormatter: (params: ValueFormatterParams) => string;
  isThreatLog?: boolean;
}

export const GridSection = memo(
  ({
    data,
    isLoading,
    onCellClicked,
    colorMode,
    timeFormatter,
    isThreatLog = false,
  }: GridSectionProps) => {
    const gridRef = useRef<AgGridReact<zLogs>>(null);

    const onGridReady = useCallback((params: GridReadyEvent) => {
      setTimeout(() => {
        const allColumnIds: string[] = [];
        params.api.getAllGridColumns().forEach((column) => {
          allColumnIds.push(column.getId());
        });
        params.api.autoSizeColumns(allColumnIds);
      }, 100);
    }, []);

    // 데이터가 없는 컬럼 숨기기
    useEffect(() => {
      if (gridRef.current?.api) {
        const api = gridRef.current.api;
        const columns = api.getAllGridColumns();

        columns.forEach((column) => {
          const field = column.getColId();
          let hasData = false;

          if (!isLoading && data) {
            // 데이터가 있는 경우에만 체크
            hasData = data.some(
              (row) =>
                row &&
                row[field] !== undefined &&
                row[field] !== null &&
                row[field] !== '' && // 빈 문자열 체크
                !(Array.isArray(row[field]) && row[field].length === 0) // 빈 배열 체크
            );
          } else if (isLoading) {
            // 로딩 중일 때는 모든 컬럼 표시
            hasData = true;
          }

          api.setColumnVisible(field, hasData);
        });
      }
    }, [data, isLoading]);

    return (
      <Box
        style={{
          width: '100%',
          height: 'calc(100vh - 160px)',
          zIndex: 0,
        }}
        className={`ag-theme-quartz${colorMode === 'dark' ? '-dark' : ''}`}
      >
        <AgGridReact
          ref={gridRef}
          rowData={!isLoading ? data : dummy}
          columnDefs={colDefs(
            !isLoading,
            onCellClicked,
            timeFormatter,
            '11.0',
            isThreatLog
          )}
          rowHeight={26}
          headerHeight={26}
          onGridReady={onGridReady}
        />
      </Box>
    );
  }
);

GridSection.displayName = 'GridSection';
