import React from "react";
import {
  useTable,
  List,
  EditButton,
  DeleteButton,
  DateField,
  Edit,
  useForm,
} from "@refinedev/antd";
import { Table, Input, Space, Typography, Form, Tag } from "antd";
const { Text } = Typography;

export function StateList() {
  const { tableProps } = useTable({ resource: "state", syncWithLocation: true });
  return (
    <List>
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column dataIndex="key" title="Key" width={280}
          render={(v) => <Text code>{v}</Text>} />
        <Table.Column dataIndex="value" title="Value"
          render={(v) => (
            <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 420 }}>
              {v || <Text type="secondary">—</Text>}
            </Text>
          )} />
        <Table.Column dataIndex="updated_at" title="Updated"
          render={(v) => <DateField value={v} />} />
        <Table.Column title="Actions" width={100}
          render={(_, r) => (
            <Space>
              <EditButton hideText size="small" recordItemId={r.id} />
              <DeleteButton hideText size="small" recordItemId={r.id} />
            </Space>
          )} />
      </Table>
    </List>
  );
}

export function StateEdit() {
  const { formProps, saveButtonProps, query } = useForm({ resource: "state", redirect: "list" });
  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Key">
          <Input value={query?.data?.data?.key} disabled />
        </Form.Item>
        <Form.Item label="Value" name="value">
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </Edit>
  );
}
