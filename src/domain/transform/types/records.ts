export interface BaseRecord {
    PK: string;
    SK: string;
    _et: string;
    _ct: string;
    _md: string;
    TYPE: string;
    [key: string]: unknown;
}

export interface DdbRecord extends BaseRecord {
    GSI1_PK: string;
    GSI1_SK: string;
    GSI2_PK: string;
    GSI2_SK: string;
}
