#!/usr/bin/env ruby
# test_redis_sse.rb
#
# This script provides two commands for testing Redis pub-sub and SSE functionality:
# 1. A Redis PUBLISH command to send notifications to user ID 1
# 2. A CURL command to establish an SSE connection for receiving notifications
#
# Usage:
#   - Run the Redis command to publish a message
#   - In a separate terminal, run the CURL command to listen for events

puts "=== Redis Pub-Sub and SSE Test Commands ==="
puts

# Configuration
USER_ID = 1
REDIS_CHANNEL = "stream:user:#{USER_ID}"  # This MUST be same as in Bridge (bridge.rb and B
ridge.ts)
SERVER_PORT = 3030
SERVER_HOST = "localhost"

# 1. Redis PUBLISH command for user ID 1
puts "=== Redis PUBLISH Command ==="
puts "# This command publishes a message to the Redis channel for user ID #{USER_ID}"
puts "# Run this in a terminal with Redis CLI installed:"
puts
redis_command = %Q(redis-cli PUBLISH "#{REDIS_CHANNEL}" '{"message":"Test notification","timestamp":#{Time.now.to_i}}')
puts redis_command
puts
puts "# You can modify the JSON payload as needed"
puts

# 2. CURL command for SSE connection
puts "=== CURL Command for SSE Connection ==="
puts "# This command establishes an SSE connection to receive notifications"
puts "# Run this in a separate terminal:"
puts
curl_command = %Q(curl -N -H "Accept: text/event-stream" "http://#{SERVER_HOST}:#{SERVER_PORT}/notifications/events")
puts curl_command
puts
puts "# The connection will remain open to receive events"
puts "# Press Ctrl+C to terminate the connection"

puts
puts "=== Instructions ==="
puts "1. Start the server if not already running"
puts "2. Open two terminal windows"
puts "3. In the first terminal, run the CURL command to establish the SSE connection"
puts "4. In the second terminal, run the Redis PUBLISH command to send a notification"
puts "5. Observe the notification appearing in the first terminal"
