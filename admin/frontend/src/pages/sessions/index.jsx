import React from "react";
import { useShow } from "@refinedev/core";
import {
  useTable,
  List,
  DeleteButton,
  DateField,
  Show,
  ShowButton,
} from "@refinedev/antd";
import { Table, Space, Typography, Descriptions, Tag } from "antd";
const { Text, Paragraph } = Typography;

export function SessionsList() {
  const { tableProps } = useTable({ resource: "sessions", syncWithLocation: true });
  return (
    <List>
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column dataIndex="session_key" title="Session Key"
          render={(v) => <Text code style={{ fontSize: 12 }}>{v}</Text>} />
        <Table.Column dataIndex="summary" title="Summary"
          render={(v) => (
            <Text type={v ? undefined : "secondary"} ellipsis={{ tooltip: v }} style={{ maxWidth: 340 }}>
              {v || "no summary"}
            </Text>
          )} />
        <Table.Column dataIndex="created_at" title="Created"
          render={(v) => <DateField value={v} />} />
        <Table.Column dataIndex="updated_at" title="Updated"
          render={(v) => <DateField value={v} />} />
        <Table.Column title="Actions" width={100}
          render={(_, r) => (
            <Space>
              <ShowButton hideText size="small" recordItemId={r.id} />
              <DeleteButton hideText size="small" recordItemId={r.id} />
            </Space>
          )} />
      </Table>
    </List>
  );
}

export function SessionsShow() {
  const { query } = useShow({ resource: "sessions" });
  const record = query?.data?.data;

  return (
    <Show isLoading={query?.isLoading}>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="Session Key">
          <Text code>{record?.session_key}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Summary">
          <Paragraph style={{ marginBottom: 0 }}>{record?.summary || "—"}</Paragraph>
        </Descriptions.Item>
        <Descriptions.Item label="Created">
          <DateField value={record?.created_at} />
        </Descriptions.Item>
        <Descriptions.Item label="Updated">
          <DateField value={record?.updated_at} />
        </Descriptions.Item>
      </Descriptions>
    </Show>
  );
}
