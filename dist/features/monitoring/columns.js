import {
  columnNames as columnNames_10_1,
  systemColumnNames as systemColumnNames_10_1,
  threatColumnNames as threatColumnNames_10_1,
  trafficColumnNames as trafficColumnNames_10_1,
} from './versions/10.1/colNameList_10.1';
import {
  columnNames as columnNames_11_0,
  systemColumnNames as systemColumnNames_11_0,
  threatColumnNames as threatColumnNames_11_0,
  trafficColumnNames as trafficColumnNames_11_0,
} from './versions/11.0/colNameList_11.0';

const trafficVersionMap = {
  10.1: trafficColumnNames_10_1,
  '11.0': trafficColumnNames_11_0,
};
const systemVersionMap = {
  10.1: systemColumnNames_10_1,
  '11.0': systemColumnNames_11_0,
};
const threatVersionMap = {
  10.1: threatColumnNames_10_1,
  '11.0': threatColumnNames_11_0,
};
const versionMap = {
  10.1: columnNames_10_1,
  '11.0': columnNames_11_0,
};
export function getColumnNames(version) {
  return versionMap[version];
}
export function getTrafficColumnNames(version) {
  return trafficVersionMap[version];
}
export function getSystemColumnNames(version) {
  return systemVersionMap[version];
}
export function getThreatColumnNames(version) {
  return threatVersionMap[version];
}
