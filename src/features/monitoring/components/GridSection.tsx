import { memo, useCallback, useRef } from 'react';

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
}

export const GridSection = memo(
  ({
    data,
    isLoading,
    onCellClicked,
    colorMode,
    timeFormatter,
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
          columnDefs={colDefs(!isLoading, onCellClicked, timeFormatter)}
          rowHeight={26}
          headerHeight={26}
          onGridReady={onGridReady}
        />
      </Box>
    );
  }
);

GridSection.displayName = 'GridSection';
